// Package main implements a MySQL TCP proxy that enforces IP whitelists
// before forwarding connections to Vitess vtgate.
//
// Architecture:
//
//	Client → Traefik TCP (:3306) → mysql-proxy Service → mysql-proxy Pod → vtgate Service (:3306)
//
// The proxy:
//  1. Accepts a TCP connection from the client
//  2. Connects to vtgate and receives the Initial Handshake Packet
//  3. Forwards the handshake to the client
//  4. Reads the client's Handshake Response 41 packet
//  5. Extracts the username from the response
//  6. Looks up database_id from K8s secrets by matching the username
//  7. Checks the IP whitelist for the owning user
//  8. If denied: sends a MySQL ERR packet (error 1130) and closes the connection
//  9. If allowed: forwards the saved Handshake Response to vtgate and starts
//     bidirectional io.Copy relay
package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/spscreations/euroscale-startup-kit/api/internal/ipwhitelist"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

func main() {
	vtgateAddr := os.Getenv("VTGATE_ADDR")
	if vtgateAddr == "" {
		vtgateAddr = "euroscale-vtgate-208e47d6:3306"
	}

	listenAddr := os.Getenv("LISTEN_ADDR")
	if listenAddr == "" {
		listenAddr = ":3307"
	}

	namespace := os.Getenv("NAMESPACE")
	if namespace == "" {
		namespace = "euroscale"
	}

	// Create in-cluster K8s clientset (same pattern as api/cmd/server/main.go).
	config, err := rest.InClusterConfig()
	if err != nil {
		log.Fatalf("Failed to create in-cluster K8s config: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Failed to create K8s clientset: %v", err)
	}

	ipwl := ipwhitelist.NewStore(clientset, namespace)

	proxy := &Proxy{
		vtgateAddr: vtgateAddr,
		clientset:  clientset,
		ipwl:       ipwl,
		namespace:  namespace,
	}

	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", listenAddr, err)
	}
	defer listener.Close()

	log.Printf("MySQL proxy listening on %s, forwarding to vtgate at %s (namespace: %s)",
		listenAddr, vtgateAddr, namespace)

	// Graceful shutdown on SIGTERM / SIGINT.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-stop
		log.Println("Shutting down...")
		listener.Close()
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-stop:
				return
			default:
				log.Printf("Accept error: %v", err)
				continue
			}
		}

		go proxy.handleConnection(conn)
	}
}

// Proxy holds the configuration and clients for the MySQL proxy.
type Proxy struct {
	vtgateAddr string
	clientset  *kubernetes.Clientset
	ipwl       *ipwhitelist.Store
	namespace  string
}

// handleConnection processes a single client connection through the proxy.
func (p *Proxy) handleConnection(clientConn net.Conn) {
	defer clientConn.Close()

	clientIP, _, err := net.SplitHostPort(clientConn.RemoteAddr().String())
	if err != nil {
		log.Printf("Failed to parse client address: %v", err)
		return
	}
	log.Printf("New connection from %s", clientIP)

	// ── Step 1: Connect to vtgate ──────────────────────────────────────
	vtgateConn, err := net.Dial("tcp", p.vtgateAddr)
	if err != nil {
		log.Printf("Failed to connect to vtgate %s: %v", p.vtgateAddr, err)
		return
	}
	defer vtgateConn.Close()

	// ── Step 2: Read Initial Handshake Packet from vtgate ──────────────
	handshake := make([]byte, 4096)
	n, err := vtgateConn.Read(handshake)
	if err != nil {
		log.Printf("Failed to read vtgate handshake: %v", err)
		return
	}
	handshakePacket := handshake[:n]

	// ── Step 3: Forward handshake to client ────────────────────────────
	if _, err := clientConn.Write(handshakePacket); err != nil {
		log.Printf("Failed to forward handshake to client %s: %v", clientIP, err)
		return
	}

	// ── Step 4: Read client's Handshake Response 41 ────────────────────
	clientResp := make([]byte, 4096)
	n, err = clientConn.Read(clientResp)
	if err != nil {
		log.Printf("Failed to read client handshake response from %s: %v", clientIP, err)
		return
	}
	clientRespPacket := clientResp[:n]

	// ── Step 5: Extract username ───────────────────────────────────────
	username, err := extractUsername(clientRespPacket)
	if err != nil {
		log.Printf("Failed to extract username from client %s: %v", clientIP, err)
		sendMySQLError(clientConn, 1130,
			fmt.Sprintf("Host '%s' is not in the IP whitelist", clientIP))
		return
	}
	log.Printf("Client %s authenticating as user %q", clientIP, username)

	// ── Step 6: Look up database_id and user_id from K8s secrets ─────
	databaseID, userID, err := p.lookupDatabaseByUsername(username)
	if err != nil {
		log.Printf("Failed to look up database for username %q from %s: %v",
			username, clientIP, err)
		sendMySQLError(clientConn, 1130,
			fmt.Sprintf("Host '%s' is not in the IP whitelist", clientIP))
		return
	}
	log.Printf("Resolved username %q → database %s, user %s",
		username, databaseID, userID)

	// ── Step 7: Check IP whitelist ────────────────────────────────────
	ctx := context.Background()
	allowed, err := p.ipwl.IsAllowed(ctx, userID, clientIP)
	if err != nil {
		log.Printf("IP whitelist check error for user %s from %s: %v",
			userID, clientIP, err)
		sendMySQLError(clientConn, 1130,
			fmt.Sprintf("Host '%s' is not in the IP whitelist", clientIP))
		return
	}

	if !allowed {
		// ── Step 8: DENIED — send MySQL ERR packet ─────────────────
		log.Printf("IP whitelist DENIED: user %s from %s", userID, clientIP)
		sendMySQLError(clientConn, 1130,
			fmt.Sprintf("Host '%s' is not in the IP whitelist", clientIP))
		return
	}

	// ── Step 9: ALLOWED — forward handshake + start bidirectional relay
	log.Printf("IP whitelist ALLOWED: user %s from %s", userID, clientIP)

	if _, err := vtgateConn.Write(clientRespPacket); err != nil {
		log.Printf("Failed to forward handshake response to vtgate: %v", err)
		return
	}

	// Bidirectional relay: client ↔ vtgate.
	// When either side closes, the other io.Copy unblocks and we clean up.
	done := make(chan struct{}, 2)
	go func() {
		io.Copy(vtgateConn, clientConn)
		done <- struct{}{}
	}()
	go func() {
		io.Copy(clientConn, vtgateConn)
		done <- struct{}{}
	}()
	<-done

	log.Printf("Connection from %s (user %q, db %s) closed", clientIP, username, databaseID)
}

// extractUsername parses a MySQL Handshake Response 41 packet and returns
// the username string.
//
// Packet format (after 4-byte MySQL packet header: 3 bytes length + 1 byte seq):
//
//	4 bytes  — client capability flags (lower 2 bytes)
//	4 bytes  — max packet size
//	1 byte   — character set
//	23 bytes — reserved (all 0x00)
//	N bytes  — null-terminated username
func extractUsername(packet []byte) (string, error) {
	// Minimum: 4 (header) + 32 (fixed fields) + 1 (null terminator) = 37
	if len(packet) < 37 {
		return "", fmt.Errorf("packet too short: %d bytes", len(packet))
	}

	// Username starts at offset 36: 4 (header) + 4 (capabilities) +
	// 4 (max_packet) + 1 (charset) + 23 (reserved).
	const usernameOffset = 36

	// Find the null terminator.
	end := usernameOffset
	for end < len(packet) && packet[end] != 0 {
		end++
	}

	if end == usernameOffset {
		return "", fmt.Errorf("empty username in handshake response")
	}

	return string(packet[usernameOffset:end]), nil
}

// lookupDatabaseByUsername searches K8s secrets for one whose "username"
// data field matches the given username.  Returns the database_id and
// user_id labels from the matching secret.
func (p *Proxy) lookupDatabaseByUsername(username string) (string, string, error) {
	ctx := context.Background()

	secrets, err := p.clientset.CoreV1().Secrets(p.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=euroscale,managed=true",
	})
	if err != nil {
		return "", "", fmt.Errorf("failed to list secrets: %w", err)
	}

	for _, secret := range secrets.Items {
		if string(secret.Data["username"]) == username {
			databaseID := secret.Labels["database"]
			userID := secret.Labels["user_id"]
			if databaseID == "" || userID == "" {
				continue
			}
			return databaseID, userID, nil
		}
	}

	return "", "", fmt.Errorf("no database found for username %q", username)
}

// sendMySQLError sends a MySQL ERR packet to the client.
//
// ERR packet payload format:
//
//	1 byte  — 0xFF header
//	2 bytes — error code (little-endian)
//	1 byte  — '#' SQL state marker
//	5 bytes — SQL state string (e.g. "HY000")
//	N bytes — error message
//
// Wrapped in a 4-byte MySQL packet header (3 bytes payload length + 1 byte seq).
func sendMySQLError(conn net.Conn, errCode uint16, message string) {
	// Build ERR payload.
	payload := make([]byte, 0, 9+len(message))
	payload = append(payload, 0xFF)                        // ERR header
	payload = binary.LittleEndian.AppendUint16(payload, errCode) // error code
	payload = append(payload, '#')                          // SQL state marker
	payload = append(payload, []byte("HY000")...)           // SQL state
	payload = append(payload, []byte(message)...)           // error message

	// Build MySQL packet: 3-byte length + 1-byte sequence number (=2).
	packet := make([]byte, 4+len(payload))
	packet[0] = byte(len(payload))
	packet[1] = byte(len(payload) >> 8)
	packet[2] = byte(len(payload) >> 16)
	packet[3] = 2 // sequence number 2 (server response after client seq 1)

	copy(packet[4:], payload)

	if _, err := conn.Write(packet); err != nil {
		log.Printf("Failed to send MySQL ERR packet: %v", err)
	}
}
