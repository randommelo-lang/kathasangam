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

# Copy manifests, source code, and migration files directly
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations

# Compile release binary directly
RUN cargo build --release --bin kathasangam-backend

# Stage 2: Minimal runtime container
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime SSL certificates and OpenSSL libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from builder
COPY --from=builder /app/target/release/kathasangam-backend /app/kathasangam-backend
COPY --from=builder /app/migrations /app/migrations

# Expose default port
EXPOSE 3000

ENV SERVE_FRONTEND=false
ENV RUST_LOG=info

CMD ["/app/kathasangam-backend"]
