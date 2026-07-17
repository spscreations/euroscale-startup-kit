output "talos_image_id" {
  value = imager_image.talos_x86.id
}

output "kubeconfig_path_hint" {
  value = "Write module.talos.kubeconfig to infra/talos/kubeconfig after apply"
}

# Module output names vary by version — expose raw module for post-apply scripts
output "cluster" {
  value     = module.talos
  sensitive = true
}
