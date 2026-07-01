# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

ARG TARGETARCH
ARG TARGETOS

# Cache dependencies.
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build.
COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build \
    -ldflags="-s -w" \
    -o /euroscale-api \
    ./cmd/server

# ── Runtime stage ───────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S euroscale && \
    adduser -S -G euroscale euroscale

WORKDIR /home/euroscale

# Copy binary from builder.
COPY --from=builder /euroscale-api /usr/local/bin/euroscale-api

# Create TLS cert directory for mounted secrets.
RUN mkdir -p /etc/euroscale/tls && \
    chown -R euroscale:euroscale /etc/euroscale && \
    chown -R euroscale:euroscale /home/euroscale

USER euroscale

EXPOSE 50051

ENTRYPOINT ["/usr/local/bin/euroscale-api"]
