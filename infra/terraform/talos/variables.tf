variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "admin_ips" {
  description = "CIDRs allowed to reach K8s API (6443) and Talos API (50000)"
  type        = list(string)
  default = [
    "194.154.34.123/32",
    "2.84.193.24/32",
  ]
}

variable "cluster_name" {
  type    = string
  default = "euroscale"
}

variable "location" {
  type    = string
  default = "fsn1"
}

variable "talos_version" {
  type    = string
  default = "v1.13.6"
}

variable "kubernetes_version" {
  type    = string
  default = "1.34.5"
}

variable "cilium_version" {
  type    = string
  default = "1.17.6"
}
