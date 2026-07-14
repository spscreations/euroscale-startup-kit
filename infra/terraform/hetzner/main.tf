terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }

  # ── Remote state backend (Hetzner Object Storage, S3-compatible) ──
  # UNCOMMENT and configure before applying in production:
  #
  # backend "s3" {
  #   bucket                      = "euroscale-terraform-state"
  #   key                         = "hetzner/terraform.tfstate"
  #   region                      = "fsn1"
  #   endpoint                    = "https://fsn1.your-objectstorage.com"
  #   access_key                  = var.s3_access_key
  #   secret_key                  = var.s3_secret_key
  #   skip_credentials_validation = true
  #   skip_metadata_api_check     = true
  #   skip_region_validation      = true
  #   force_path_style            = true
  # }
  #
  # For now, state is stored locally. This is acceptable for a single-operator
  # setup but MUST be migrated to remote state before team use.
  # Steps to migrate:
  #   1. Create an Object Storage bucket via Hetzner Cloud Console
  #   2. Generate S3 access keys
  #   3. Set the credentials in terraform.tfvars (DO NOT commit)
  #   4. Uncomment the backend block above
  #   5. Run: terraform init -migrate-state
}

provider "hcloud" {
  token = var.hcloud_token
}

# Create servers
resource "hcloud_server" "nodes" {
  for_each     = var.node_specs
  name         = each.value.name
  # NOTE: Hetzner CAX servers are ARM64 (Ampere Altra). If you change to
  # CAX instances, update the CI pipeline to build linux/arm64 images.
  # CAX21 (4 vCPU, 8 GB, €5.95/mo) is the closest ARM equivalent to CX23.
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
