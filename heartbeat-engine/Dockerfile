# BLOOM Heartbeat Engine Dockerfile — with browser automation
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Set working directory
WORKDIR /app

# Install Node 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install main dependencies
COPY package*.json ./
RUN npm ci --only=production

# Install playwright browsers
RUN npx playwright install chromium --with-deps

# Copy application code
COPY src/ ./src/
COPY database/ ./database/
COPY dashboard/ ./dashboard/

# Install dashboard dependencies and build React frontend
WORKDIR /app/dashboard
RUN npm install
RUN npm run build

# Switch back to main app directory
WORKDIR /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "process.exit(0)"

EXPOSE 3000

CMD ["npm", "start"]
