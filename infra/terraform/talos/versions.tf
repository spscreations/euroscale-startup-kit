terraform {
  required_version = ">= 1.10.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = ">= 1.60.1"
    }
    imager = {
      source  = "hcloud-talos/imager"
      version = ">= 1.0.6"
    }
    talos = {
      source  = "siderolabs/talos"
      version = ">= 0.7.0"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

provider "imager" {
  token = var.hcloud_token
}

provider "talos" {}
