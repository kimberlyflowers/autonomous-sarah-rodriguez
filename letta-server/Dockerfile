# BLOOM Letta Server Dockerfile
# Uses official Letta (formerly MemGPT) Docker image for agent memory management

FROM letta/letta-server:latest

# Set working directory
WORKDIR /app

# Environment variables for Railway deployment
ENV LETTA_SERVER_PORT=8283
ENV LETTA_SERVER_HOST=0.0.0.0

# Copy configuration files if any
COPY config/ ./config/

# Create volume for data persistence (Railway will handle this)
VOLUME ["/app/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8283/health || exit 1

# Expose port
EXPOSE 8283

# The base image already has the CMD defined
# But we can override if needed for Railway-specific configuration