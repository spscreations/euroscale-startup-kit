variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  sensitive   = true
}

variable "ssh_key_name" {
  description = "Name of SSH key in Hetzner project"
  default     = "euroscale-admin"
}

variable "node_specs" {
  description = "Per-node configuration"
  type = map(object({
    name     = string
    location = string
    type     = string  # "control" or "worker"
  }))
  default = {
    node-1 = { name = "euroscale-cp-1", location = "nbg1",  type = "control" }
    node-2 = { name = "euroscale-wk-1", location = "nbg1",  type = "worker"  }
    node-3 = { name = "euroscale-wk-2", location = "hel1",  type = "worker"  }
  }
}
