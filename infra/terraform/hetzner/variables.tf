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
    type     = string # "control" or "worker"
  }))
  default = {
    node-1 = { name = "euroscale-cp-1", location = "fsn1", type = "control" }
    node-2 = { name = "euroscale-wk-1", location = "fsn1", type = "worker" }
    node-3 = { name = "euroscale-wk-2", location = "fsn1", type = "worker" }
  }
}

variable "admin_allowed_ips" {
  description = "List of CIDR blocks allowed to access SSH, K8s API, and admin ports"
  type        = list(string)
  # WARNING: The default below uses RFC 1918 private ranges for development
  # convenience. In production, you MUST override this in terraform.tfvars with
  # your actual office/VPN IP ranges. Leaving private ranges allows anyone on
  # the same private network to access SSH/K8s API — this is only safe behind
  # a VPN or in isolated lab environments.
  #
  # Production example (set in terraform.tfvars):
  #   admin_allowed_ips = [
  #     "203.0.113.0/24",   # Office network
  #     "198.51.100.42/32", # VPN server
  #   ]
  default = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
}
