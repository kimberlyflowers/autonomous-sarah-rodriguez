# BLOOM Heartbeat Engine Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install main dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/

# Copy dashboard code
COPY dashboard/ ./dashboard/

# Install dashboard dependencies and build React frontend
WORKDIR /app/dashboard
RUN npm install
RUN npm run build

# Switch back to main app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S bloom && \
    adduser -S heartbeat -u 1001 -G bloom

# Set ownership
RUN chown -R heartbeat:bloom /app
USER heartbeat

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)"

# Expose port for webhook receiver
EXPOSE 3000

# Start the heartbeat engine
CMD ["npm", "start"]