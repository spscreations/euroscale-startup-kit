terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

# Create servers
resource "hcloud_server" "nodes" {
  for_each     = var.node_specs
  name         = each.value.name
  server_type  = "cx23" # 2 vCPU, 4 GB RAM x86 — €5.49/mo each
  image        = "ubuntu-24.04"
  location     = each.value.location
  ssh_keys     = [var.ssh_key_name]
  backups      = false # We handle backups via Vitess native S3
  firewall_ids = [hcloud_firewall.euroscale.id]

  labels = {
    type    = each.value.type
    region  = each.value.location
    cluster = "euroscale"
  }
}

# Persistent volumes for database data
resource "hcloud_volume" "data" {
  for_each  = var.node_specs
  name      = "${each.value.name}-data"
  size      = 50 # 50 GB SSD per node
  server_id = hcloud_server.nodes[each.key].id
  automount = false
  format    = "ext4"
  labels = {
    cluster = "euroscale"
    type    = "database-data"
  }
}
