# Stage 1: Build the Rust backend executable
FROM rust:1.85-slim-bookworm AS builder
WORKDIR /app

# Install build dependencies for OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY Cargo.toml Cargo.lock ./

# Cache dependencies by pre-building a dummy binary
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy real source code and migration files
COPY src ./src
COPY migrations ./migrations

# Touch main.rs so cargo detects the source changes and compiles the real binary
RUN touch src/main.rs && cargo build --release --bin kathasangam-backend

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
