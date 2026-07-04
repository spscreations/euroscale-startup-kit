#!/usr/bin/env bash
# Generate TLS certificates for Vitess vtgate MySQL SSL.
# Run this script to create a new CA and server certificate.
# The CA cert should be distributed to clients; the server cert+key
# are used by vtgate via the Vitess operator secureTransport config.
set -euo pipefail

OUTDIR="${1:-.}"
DAYS_CA="${2:-3650}"
DAYS_SERVER="${3:-365}"

cd "$OUTDIR"

echo "=== Generating EuroScale VTGate CA ==="
openssl ecparam -genkey -name prime256v1 -noout -out euroscale-vtgate-ca.key
openssl req -new -x509 -key euroscale-vtgate-ca.key -out euroscale-vtgate-ca.crt \
  -days "$DAYS_CA" \
  -subj "/CN=EuroScale VTGate CA"

echo "=== Generating VTGate server certificate ==="
openssl ecparam -genkey -name prime256v1 -noout -out euroscale-vtgate.key

# SANs must cover all vtgate service DNS names:
# - Global cluster-level service
# - Per-cell vtgate services
# - External hostname
openssl req -new -key euroscale-vtgate.key -out euroscale-vtgate.csr \
  -subj "/CN=euroscale-vtgate.euroscale.svc" \
  -addext "subjectAltName=DNS:euroscale-vtgate.euroscale.svc,DNS:euroscale-vtgate-208e47d6.euroscale.svc,DNS:euroscale-helsinki-vtgate-80010cca.euroscale.svc,DNS:euroscale-nuremberg-vtgate-3f7c5d47.euroscale.svc,DNS:db.euroscale.app"

openssl x509 -req -in euroscale-vtgate.csr \
  -CA euroscale-vtgate-ca.crt -CAkey euroscale-vtgate-ca.key \
  -CAcreateserial -out euroscale-vtgate.crt \
  -days "$DAYS_SERVER" -copy_extensions copyall

# Cleanup CSR
rm -f euroscale-vtgate.csr

echo "=== Verifying certificates ==="
openssl verify -CAfile euroscale-vtgate-ca.crt euroscale-vtgate.crt

echo ""
echo "=== Done ==="
echo "Files created:"
echo "  euroscale-vtgate-ca.crt   — CA certificate (distribute to clients)"
echo "  euroscale-vtgate-ca.key   — CA private key (keep secure!)"
echo "  euroscale-vtgate.crt      — Server certificate (for vtgate)"
echo "  euroscale-vtgate.key      — Server private key (for vtgate)"
echo ""
echo "To apply to the cluster:"
echo "  kubectl -n euroscale create secret generic euroscale-vtgate-tls \\"
echo "    --from-file=ca.crt=euroscale-vtgate-ca.crt \\"
echo "    --from-file=tls.crt=euroscale-vtgate.crt \\"
echo "    --from-file=tls.key=euroscale-vtgate.key \\"
echo "    --dry-run=client -o yaml | kubectl apply -f -"
