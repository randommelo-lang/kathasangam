# Stage 1: Build the Rust backend executable
FROM rust:slim-bookworm AS builder
WORKDIR /app

# Install build dependencies for OpenSSL and C toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Cache dependency builds before copying full source
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main() {}" > src/main.rs \
    && cargo build --release --bin kathasangam-backend \
    && rm -rf src

# Copy actual source code and migration files
COPY src ./src
COPY migrations ./migrations

# Touch main.rs so cargo rebuilds the application binary using cached deps
RUN touch src/main.rs && cargo build --release --bin kathasangam-backend

# Stage 2: Minimal runtime container
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime SSL certificates, OpenSSL libraries, and curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/sh appuser

# Copy the compiled binary and migrations from builder
COPY --from=builder /app/target/release/kathasangam-backend /app/kathasangam-backend
COPY --from=builder /app/migrations /app/migrations
RUN mkdir -p /app/uploads && chown -R appuser:appuser /app

USER appuser

# Expose default port
EXPOSE 3000

ENV SERVE_FRONTEND=false
ENV RUST_LOG=info
ENV LOG_FORMAT=json

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["/app/kathasangam-backend"]
