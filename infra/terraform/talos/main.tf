locals {
  talos_version = var.talos_version
}

# Vanilla Talos schematic (no extra system extensions)
resource "talos_image_factory_schematic" "amd64" {
  schematic = yamlencode({
    customization = {
      systemExtensions = {
        officialExtensions = []
      }
    }
  })
}

data "talos_image_factory_urls" "hcloud_amd64" {
  talos_version = local.talos_version
  schematic_id  = talos_image_factory_schematic.amd64.id
  platform      = "hcloud"
  architecture  = "amd64"
}

# Upload Talos disk image as Hetzner snapshot (platform=hcloud — required for CCM)
resource "imager_image" "talos_x86" {
  image_url    = data.talos_image_factory_urls.hcloud_amd64.urls.disk_image
  architecture = "x86"
  description  = "Talos ${local.talos_version} hcloud-amd64 euroscale"

  labels = {
    version = local.talos_version
    cluster = var.cluster_name
  }
}

module "talos" {
  source  = "hcloud-talos/talos/hcloud"
  version = "3.4.12"

  hcloud_token = var.hcloud_token

  talos_version      = local.talos_version
  kubernetes_version = var.kubernetes_version
  cilium_version     = var.cilium_version

  talos_image_id_x86 = imager_image.talos_x86.id
  disable_arm        = true

  cluster_name  = var.cluster_name
  location_name = var.location

  # Management plane: admin IPs only (Pi + user)
  firewall_use_current_ip   = false
  firewall_kube_api_source  = var.admin_ips
  firewall_talos_api_source = var.admin_ips

  enable_alias_ip           = true
  enable_floating_ip        = true
  kubeconfig_endpoint_mode  = "public_ip"
  talosconfig_endpoints_mode = "public_ip"

  # Cost-parity topology with previous Ubuntu/K3s layout
  control_plane_nodes = [
    { id = 1, type = "cx23" },
  ]

  worker_nodes = [
    { id = 1, type = "cx23" },
    { id = 2, type = "cx23" },
  ]

  # Allow platform pods on CP while small (Traefik etc.)
  control_plane_allow_schedule = true

  deploy_cilium                   = true
  deploy_prometheus_operator_crds = true
  deploy_hcloud_ccm               = true

  # MySQL-friendly sysctls
  sysctls_extra_args = {
    "net.core.somaxconn"             = "4096"
    "net.ipv4.tcp_tw_reuse"          = "1"
    "vm.swappiness"                  = "1"
    "fs.file-max"                    = "2097152"
    "net.core.rmem_max"              = "26214400"
    "net.core.wmem_max"              = "26214400"
  }
}
