resource "hcloud_firewall" "euroscale" {
  name = "euroscale-internal"

  # SSH — restricted to admin/office IP range only
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = var.admin_allowed_ips
    port       = "22"
  }

  # K8s API — restricted to admin/office IP range only
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = var.admin_allowed_ips
    port       = "6443"
  }

  # Internal node-to-node (Flannel VXLAN)
  # VXLAN uses the node's public IP as the tunnel source, so source_ips must
  # cover the actual Hetzner public IPs — not the pod network (10.x).
  rule {
    direction  = "in"
    protocol   = "udp"
    source_ips = ["0.0.0.0/0", "::/0"]
    port       = "8472"
  }

  # HTTP for Traefik ingress (dashboard + API routes)
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = ["0.0.0.0/0"]
    port       = "80"
  }

  # HTTPS for Traefik ingress
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = ["0.0.0.0/0"]
    port       = "443"
  }

  # Traefik dashboard / metrics (if exposed via NodePort)
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = var.admin_allowed_ips
    port       = "30080"
  }
}
