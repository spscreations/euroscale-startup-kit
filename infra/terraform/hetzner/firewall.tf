resource "hcloud_firewall" "euroscale" {
  name = "euroscale-internal"
  
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = ["0.0.0.0/0", "::/0"]
    port       = "22"        # SSH
  }
  
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = ["0.0.0.0/0", "::/0"]
    port       = "6443"          # K8s API — lock to your IP in prod
  }
  
  # Vitess ports
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = ["0.0.0.0/0"]
    port       = "3306"      # MySQL protocol
  }
  
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = ["0.0.0.0/0"]
    port       = "15991"     # vtgate admin
  }
  
  # Internal node-to-node (Flannel VXLAN)
  rule {
    direction  = "in"
    protocol   = "udp"
    source_ips = ["10.0.0.0/8"]
    port       = "8472"
  }
  
  # HTTP for admin dashboard
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = ["0.0.0.0/0"]
    port       = "80"
  }
  
  # HTTPS for admin dashboard
  rule {
    direction  = "in"
    protocol   = "tcp"
    source_ips = ["0.0.0.0/0"]
    port       = "443"
  }
}
