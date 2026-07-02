output "node_ips" {
  value = {
    for k, s in hcloud_server.nodes : k => {
      name        = s.name
      ipv4        = s.ipv4_address
      region      = s.location
      role        = s.labels["type"]
      data_volume = hcloud_volume.data[k].id
    }
  }
}

output "k3s_control_plane_ip" {
  value = hcloud_server.nodes["node-1"].ipv4_address
}

output "total_monthly_cost_estimate" {
  value = "~€16.47/mo (3 × cx23 @ €5.49/mo each)"
}
