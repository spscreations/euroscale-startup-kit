// Package mollie provides a thin wrapper around the Mollie Payments API via
// plain net/http. It handles payment creation, status verification, webhook
// processing, and invoice listing for EuroScale tier subscriptions.
package mollie

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/spscreations/euroscale-startup-kit/api/internal/tiers"
)

// ── Config ───────────────────────────────────────────────────────────────────

// MollieConfig holds the configuration needed to initialise the Mollie client.
type MollieConfig struct {
	APIKey  string
	BaseURL string // "https://api.mollie.com"
}

// ── Client ───────────────────────────────────────────────────────────────────

// Client wraps a plain HTTP client for the Mollie Payments API.
type Client struct {
	apiKey  string
	baseURL string
	http    *http.Client
}

// NewClient creates a Mollie API client authenticated with the given API key.
func NewClient(config MollieConfig) (*Client, error) {
	if config.APIKey == "" {
		return nil, fmt.Errorf("mollie: API key is required")
	}
	if config.BaseURL == "" {
		config.BaseURL = "https://api.mollie.com"
	}
	return &Client{
		apiKey:  config.APIKey,
		baseURL: strings.TrimRight(config.BaseURL, "/"),
		http:    &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// ── Payment operations ───────────────────────────────────────────────────────

// CreatePayment sends a payment request to Mollie and returns the checkout URL
// and payment ID. The user is redirected to checkoutURL to complete payment.
func (c *Client) CreatePayment(
	ctx context.Context,
	amountEUR float64,
	description, redirectURL, webhookURL, userID, tier, email string,
) (checkoutURL, paymentID string, err error) {
	amountStr := fmt.Sprintf("%.2f", amountEUR)

	body := map[string]interface{}{
		"amount": map[string]string{
			"currency": "EUR",
			"value":    amountStr,
		},
		"description": description,
		"redirectUrl": redirectURL,
		"webhookUrl":  webhookURL,
		"metadata": map[string]string{
			"user_id": userID,
			"tier":    tier,
			"email":   email,
		},
	}

	resp, err := c.do(ctx, http.MethodPost, "/v2/payments", body)
	if err != nil {
		return "", "", fmt.Errorf("mollie: failed to create payment: %w", err)
	}

	var payment MolliePayment
	if err := json.Unmarshal(resp, &payment); err != nil {
		return "", "", fmt.Errorf("mollie: failed to parse create payment response: %w", err)
	}

	paymentID = payment.ID
	if payment.Links.Checkout != nil {
		checkoutURL = payment.Links.Checkout.Href
	}

	return checkoutURL, paymentID, nil
}

// GetPayment fetches a payment from Mollie by its ID.
func (c *Client) GetPayment(ctx context.Context, paymentID string) (*MolliePayment, error) {
	resp, err := c.do(ctx, http.MethodGet, "/v2/payments/"+paymentID, nil)
	if err != nil {
		return nil, fmt.Errorf("mollie: failed to get payment %q: %w", paymentID, err)
	}

	var payment MolliePayment
	if err := json.Unmarshal(resp, &payment); err != nil {
		return nil, fmt.Errorf("mollie: failed to parse payment response: %w", err)
	}

	return &payment, nil
}

// ── Internal HTTP helper ─────────────────────────────────────────────────────

func (c *Client) do(ctx context.Context, method, path string, body interface{}) ([]byte, error) {
	url := c.baseURL + path

	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("mollie: failed to marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("mollie: failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mollie: request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("mollie: failed to read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("mollie: unexpected status %d: %s", resp.StatusCode, string(data))
	}

	return data, nil
}

// ── Mollie API response types ────────────────────────────────────────────────

// MolliePayment represents a Mollie payment object returned by the API.
type MolliePayment struct {
	ID          string                 `json:"id"`
	Description string                 `json:"description"`
	Amount      MollieAmount           `json:"amount"`
	Status      string                 `json:"status"`
	CreatedAt   string                 `json:"createdAt"`
	PaidAt      string                 `json:"paidAt"`
	Metadata    map[string]interface{} `json:"metadata"`
	Links       MollieLinks            `json:"_links"`
}

// MollieAmount holds currency and value for a Mollie amount object.
type MollieAmount struct {
	Currency string `json:"currency"`
	Value    string `json:"value"` // e.g. "29.00"
}

// MollieLinks holds the HAL links for a Mollie payment.
type MollieLinks struct {
	Checkout *MollieLink `json:"checkout"`
	PDF      *MollieLink `json:"pdf"`
	Self     *MollieLink `json:"self"`
}

// MollieLink is a single HAL link with href and type.
type MollieLink struct {
	Href string `json:"href"`
	Type string `json:"type"`
}

// ── In-memory payment store ──────────────────────────────────────────────────

// PaymentInfo tracks a payment and its status in memory.
type PaymentInfo struct {
	PaymentID  string `json:"payment_id"`
	UserID     string `json:"user_id"`
	Tier       string `json:"tier"`
	Amount     string `json:"amount"`
	Status     string `json:"status"` // "pending", "paid", "failed", "cancelled"
	InvoiceRef string `json:"invoice_ref,omitempty"`
	CreatedAt  string `json:"created_at"`
	PaidAt     string `json:"paid_at,omitempty"`
}

// ── Request / response shapes ────────────────────────────────────────────────

type createPaymentRequest struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Tier   string `json:"tier"`
}

type createPaymentResponse struct {
	CheckoutURL string `json:"checkout_url"`
	PaymentID   string `json:"payment_id"`
}

type invoiceItem struct {
	ID          string `json:"id"`
	Amount      string `json:"amount"`
	Date        string `json:"date"`
	Description string `json:"description"`
	Status      string `json:"status"`
	PDFURL      string `json:"pdf_url"`
}

type invoiceListResponse struct {
	Invoices []invoiceItem `json:"invoices"`
}

// ── HTTP Handler ─────────────────────────────────────────────────────────────

// Handler exposes HTTP endpoints for Mollie payment creation, webhook
// processing, and invoice listing. It is wired into the HTTP mux in
// cmd/server/main.go.
type Handler struct {
	client        *Client
	tierStore     *tiers.Store
	webhookSecret string

	payments map[string]*PaymentInfo
	mu       sync.RWMutex
}

// NewHandler creates a new Mollie HTTP handler.
// webhookSecret is the secret key Mollie uses to sign webhook payloads
// (HMAC-SHA256). Set to empty string to skip verification (not recommended).
func NewHandler(client *Client, tierStore *tiers.Store, webhookSecret string) *Handler {
	return &Handler{
		client:        client,
		tierStore:     tierStore,
		webhookSecret: webhookSecret,
		payments:      make(map[string]*PaymentInfo),
	}
}

// ── Create Payment ───────────────────────────────────────────────────────────

// HandleCreatePayment processes POST /api/v1/create-payment and returns a
// Mollie hosted checkout URL.
func (h *Handler) HandleCreatePayment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if h.client == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"message": "Mollie payment service is not configured",
		})
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "failed to read request body"})
		return
	}
	defer r.Body.Close()

	var req createPaymentRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
		return
	}

	if req.UserID == "" || req.Email == "" || req.Tier == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"message": "user_id, email, and tier are required",
		})
		return
	}

	req.Tier = strings.ToLower(req.Tier)

	// Validate tier exists.
	if tiers.GetTier(req.Tier) == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"message": fmt.Sprintf("invalid tier %q", req.Tier),
		})
		return
	}

	// Map tier to price.
	price, ok := tierPrice(req.Tier)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"message": fmt.Sprintf("unknown tier %q", req.Tier),
		})
		return
	}

	// Build Mollie URLs from env or defaults.
	webhookURL := getEnvOrDefault("MOLLIE_WEBHOOK_URL", "https://api.euroscale.app/api/v1/mollie-webhook")
	redirectURL := getEnvOrDefault("MOLLIE_REDIRECT_URL", "https://euroscale.app/dashboard/billing?payment=success")

	description := fmt.Sprintf("EuroScale %s tier — monthly", tierDisplayName(req.Tier))

	checkoutURL, paymentID, err := h.client.CreatePayment(
		r.Context(),
		price,
		description,
		redirectURL,
		webhookURL,
		req.UserID,
		req.Tier,
		req.Email,
	)
	if err != nil {
		log.Printf("ERROR: Mollie create payment failed: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"message": "failed to create payment",
		})
		return
	}

	// Store the payment reference.
	amountStr := fmt.Sprintf("€%.2f", price)
	h.mu.Lock()
	h.payments[paymentID] = &PaymentInfo{
		PaymentID: paymentID,
		UserID:    req.UserID,
		Tier:      req.Tier,
		Amount:    amountStr,
		Status:    "pending",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	h.mu.Unlock()

	log.Printf("INFO: Mollie payment created: id=%s user=%s tier=%s", paymentID, req.UserID, req.Tier)

	writeJSON(w, http.StatusOK, createPaymentResponse{
		CheckoutURL: checkoutURL,
		PaymentID:   paymentID,
	})
}

// ── Webhook ──────────────────────────────────────────────────────────────────

// HandleWebhook processes POST /api/v1/mollie-webhook. Mollie calls this when
// a payment's status changes. We verify the webhook signature, then confirm
// with the Mollie API, and on "paid", upgrade the user's tier.
func (h *Handler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Read the raw body for signature verification.
	rawBody, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("ERROR: mollie webhook: failed to read body: %v", err)
		w.WriteHeader(http.StatusOK)
		return
	}
	r.Body.Close()

	// Verify Mollie webhook signature if a webhook secret is configured.
	// Mollie signs webhook payloads with HMAC-SHA256 using the webhook secret
	// as the key. The signature is in the X-Mollie-Signature header.
	if h.webhookSecret != "" {
		signature := r.Header.Get("X-Mollie-Signature")
		if signature == "" {
			log.Printf("ERROR: mollie webhook: missing X-Mollie-Signature header")
			w.WriteHeader(http.StatusOK)
			return
		}
		if !verifyMollieSignature(rawBody, signature, h.webhookSecret) {
			log.Printf("ERROR: mollie webhook: invalid signature")
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	// Mollie sends webhook payload as application/x-www-form-urlencoded.
	// Reconstruct the form body for ParseForm.
	r.Body = io.NopCloser(bytes.NewReader(rawBody))
	if err := r.ParseForm(); err != nil {
		log.Printf("ERROR: mollie webhook: failed to parse form: %v", err)
		w.WriteHeader(http.StatusOK)
		return
	}

	paymentID := r.FormValue("id")
	if paymentID == "" {
		log.Printf("ERROR: mollie webhook: missing payment id in form body")
		w.WriteHeader(http.StatusOK)
		return
	}

	// Idempotency: check if this payment ID was already processed.
	h.mu.RLock()
	existing := h.payments[paymentID]
	h.mu.RUnlock()
	if existing != nil && existing.Status == "paid" {
		log.Printf("INFO: mollie webhook: payment %q already processed (invoice: %s), skipping", paymentID, existing.InvoiceRef)
		writeJSON(w, http.StatusOK, map[string]string{
			"status":      "already_processed",
			"invoice_ref": existing.InvoiceRef,
		})
		return
	}

	if h.client == nil {
		log.Printf("ERROR: mollie webhook: client not configured for payment %q", paymentID)
		w.WriteHeader(http.StatusOK)
		return
	}

	// Verify payment status with Mollie.
	payment, err := h.client.GetPayment(r.Context(), paymentID)
	if err != nil {
		log.Printf("ERROR: mollie webhook: failed to get payment %q: %v", paymentID, err)
		w.WriteHeader(http.StatusOK)
		return
	}

	log.Printf("INFO: mollie webhook: payment %q status=%s", paymentID, payment.Status)

	// Only process "paid" payments.
	if payment.Status != "paid" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Extract user metadata from the payment.
	userID := ""
	tierName := ""

	// Check Mollie metadata first.
	if payment.Metadata != nil {
		if uid, ok := payment.Metadata["user_id"].(string); ok {
			userID = uid
		}
		if t, ok := payment.Metadata["tier"].(string); ok {
			tierName = t
		}
	}

	// Fall back to in-memory store.
	if userID == "" || tierName == "" {
		h.mu.RLock()
		info := h.payments[paymentID]
		h.mu.RUnlock()
		if info != nil {
			if userID == "" {
				userID = info.UserID
			}
			if tierName == "" {
				tierName = info.Tier
			}
		}
	}

	if userID == "" || tierName == "" {
		log.Printf("ERROR: mollie webhook: no user metadata for payment %q", paymentID)
		w.WriteHeader(http.StatusOK)
		return
	}

	// Upgrade the user's tier.
	if err := h.tierStore.SetUserTier(r.Context(), userID, tierName); err != nil {
		log.Printf("ERROR: mollie webhook: failed to upgrade user %q to tier %q: %v",
			userID, tierName, err)
		w.WriteHeader(http.StatusOK)
		return
	}

	log.Printf("INFO: mollie webhook: upgraded user %q to tier %q", userID, tierName)

	// Generate invoice reference.
	invoiceRef := generateInvoiceRef(paymentID)
	amountStr := ""
	if payment.Amount.Currency != "" || payment.Amount.Value != "" {
		amountStr = payment.Amount.Currency + " " + payment.Amount.Value
	}

	// Update in-memory status.
	h.mu.Lock()
	if info, ok := h.payments[paymentID]; ok {
		info.Status = "paid"
		info.PaidAt = time.Now().UTC().Format(time.RFC3339)
		info.InvoiceRef = invoiceRef
		if amountStr != "" {
			info.Amount = amountStr
		}
	} else {
		h.payments[paymentID] = &PaymentInfo{
			PaymentID: paymentID,
			UserID:    userID,
			Tier:      tierName,
			Amount:    amountStr,
			Status:    "paid",
			InvoiceRef: invoiceRef,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
			PaidAt:    time.Now().UTC().Format(time.RFC3339),
		}
	}
	h.mu.Unlock()

	log.Printf("INFO: mollie webhook: payment %q processed — invoice %s, user %q → tier %q",
		paymentID, invoiceRef, userID, tierName)

	writeJSON(w, http.StatusOK, map[string]string{
		"status":      "processed",
		"invoice_ref": invoiceRef,
	})
}

// ── Confirm Payment ──────────────────────────────────────────────────────────

// HandleConfirmPayment processes GET /api/v1/confirm-payment?id=xxx.
// Called by the dashboard when the user returns from the Mollie checkout
// redirect. It verifies the payment status with the Mollie API and upgrades
// the user's tier immediately, bypassing the webhook (which may not reach
// this server if it's behind a firewall).
func (h *Handler) HandleConfirmPayment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	paymentID := r.URL.Query().Get("id")
	if paymentID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "payment id is required"})
		return
	}

	if h.client == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "Mollie payment service is not configured"})
		return
	}

	// Verify payment status with Mollie.
	payment, err := h.client.GetPayment(r.Context(), paymentID)
	if err != nil {
		log.Printf("ERROR: confirm-payment: failed to get payment %q: %v", paymentID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "failed to verify payment"})
		return
	}

	if payment.Status != "paid" {
		writeJSON(w, http.StatusOK, map[string]string{"status": payment.Status, "message": "payment not yet completed"})
		return
	}

	// Extract user metadata from the payment.
	userID := ""
	tierName := ""

	if payment.Metadata != nil {
		if uid, ok := payment.Metadata["user_id"].(string); ok {
			userID = uid
		}
		if t, ok := payment.Metadata["tier"].(string); ok {
			tierName = t
		}
	}

	// Fall back to in-memory store.
	if userID == "" || tierName == "" {
		h.mu.RLock()
		info := h.payments[paymentID]
		h.mu.RUnlock()
		if info != nil {
			if userID == "" {
				userID = info.UserID
			}
			if tierName == "" {
				tierName = info.Tier
			}
		}
	}

	if userID == "" || tierName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "could not determine user or tier for this payment"})
		return
	}

	// Upgrade the user's tier.
	if err := h.tierStore.SetUserTier(r.Context(), userID, tierName); err != nil {
		log.Printf("ERROR: confirm-payment: failed to upgrade user %q to tier %q: %v", userID, tierName, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "failed to upgrade tier"})
		return
	}

	// Update in-memory status.
	amountStr := ""
	if payment.Amount.Currency != "" || payment.Amount.Value != "" {
		amountStr = payment.Amount.Currency + " " + payment.Amount.Value
	}
	invoiceRef := generateInvoiceRef(paymentID)

	h.mu.Lock()
	if info, ok := h.payments[paymentID]; ok {
		info.Status = "paid"
		info.PaidAt = time.Now().UTC().Format(time.RFC3339)
		info.InvoiceRef = invoiceRef
		if amountStr != "" {
			info.Amount = amountStr
		}
	} else {
		h.payments[paymentID] = &PaymentInfo{
			PaymentID: paymentID,
			UserID:    userID,
			Tier:      tierName,
			Amount:    amountStr,
			Status:    "paid",
			InvoiceRef: invoiceRef,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
			PaidAt:    time.Now().UTC().Format(time.RFC3339),
		}
	}
	h.mu.Unlock()

	log.Printf("INFO: confirm-payment: user %q upgraded to tier %q (payment %q)", userID, tierName, paymentID)

	writeJSON(w, http.StatusOK, map[string]string{
		"status":      "paid",
		"tier":        tierName,
		"invoice_ref": invoiceRef,
	})
}

// ── List Invoices ────────────────────────────────────────────────────────────

// HandleListInvoices processes GET /api/v1/invoices?user_id=xxx and returns
// all in-memory payments for the given user.
func (h *Handler) HandleListInvoices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"message": "user_id query parameter is required",
		})
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	invoices := make([]invoiceItem, 0)
	for _, info := range h.payments {
		if info.UserID != userID {
			continue
		}
		date := info.CreatedAt
		if len(date) > 10 {
			date = date[:10]
		}
		invoices = append(invoices, invoiceItem{
			ID:          info.PaymentID,
			Amount:      info.Amount,
			Date:        date,
			Description: fmt.Sprintf("EuroScale %s tier", tierDisplayName(info.Tier)),
			Status:      info.Status,
			PDFURL:      "",
		})
	}

	writeJSON(w, http.StatusOK, invoiceListResponse{Invoices: invoices})
}

// ── helpers ──────────────────────────────────────────────────────────────────

// generateInvoiceRef creates a human-readable invoice reference from a payment ID.
// Format: INV-YYMMDD-XXXX where XXXX are the last 4 chars of the payment ID.
func generateInvoiceRef(paymentID string) string {
	now := time.Now().UTC()
	datePart := now.Format("060102") // YYMMDD

	suffix := paymentID
	if len(paymentID) > 4 {
		suffix = paymentID[len(paymentID)-4:]
	}

	return fmt.Sprintf("INV-%s-%s", datePart, suffix)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// tierPrice returns the EUR price for a given tier name.
func tierPrice(tier string) (float64, bool) {
	switch tier {
	case tiers.TierScale:
		return 29.0, true
	case tiers.TierTeam:
		return 99.0, true
	case tiers.TierBusiness:
		return 399.0, true
	default:
		return 0, false
	}
}

// tierDisplayName returns a human-readable display name for a tier.
func tierDisplayName(tier string) string {
	switch tier {
	case tiers.TierScale:
		return "Scale"
	case tiers.TierTeam:
		return "Team"
	case tiers.TierBusiness:
		return "Business"
	default:
		return tier
	}
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// verifyMollieSignature validates the X-Mollie-Signature header against
// the raw webhook body using HMAC-SHA256. The secret is the Mollie API key
// used to sign webhook payloads.
func verifyMollieSignature(body []byte, signature, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
