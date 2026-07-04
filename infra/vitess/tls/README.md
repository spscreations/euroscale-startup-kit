# VTGate TLS Certificates

This directory contains the TLS certificates for Vitess vtgate MySQL SSL.

## Files

- `euroscale-vtgate-ca.crt` — CA certificate (public, distributed to API clients)
- `generate-certs.sh` — Script to regenerate all certificates

## Private Keys (NOT committed to git)

The private keys are stored only in the Kubernetes cluster as a Secret:
- CA private key: `euroscale-vtgate-ca.key`
- Server private key: `euroscale-vtgate.key`

Both are stored in the `euroscale-vtgate-tls` Secret in the `euroscale` namespace.

## Regenerating certificates

```bash
cd infra/vitess/tls
./generate-certs.sh .
```

Then update the Kubernetes secret:
```bash
kubectl -n euroscale create secret generic euroscale-vtgate-tls \
  --from-file=ca.crt=euroscale-vtgate-ca.crt \
  --from-file=tls.crt=euroscale-vtgate.crt \
  --from-file=tls.key=euroscale-vtgate.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Architecture

- **vtgate** is configured via VitessCluster `secureTransport` to require TLS
  on the MySQL protocol (port 3306). The operator sets:
  - `--mysql_server_ssl_cert`
  - `--mysql_server_ssl_key`
  - `--mysql_server_require_secure_transport=true`

- **API** loads the CA cert from `/etc/euroscale/tls/ca.crt` (mounted from the
  `euroscale-vtgate-tls` Secret) and includes it in connection strings with
  `ssl-mode=VERIFY_IDENTITY`.

- **Clients** connect using:
  ```
  mysql://user:pass@db.euroscale.app:3306/dbname?ssl-mode=VERIFY_IDENTITY
  ```
  With the CA certificate as the trust anchor.
