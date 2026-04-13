#!/bin/bash
# BLOOM Ollama Startup Script
# 1. Starts Ollama server in background
# 2. Waits for it to be ready
# 3. Pulls the default model (llama3.2)
# 4. Keeps server running

set -e

echo "BLOOM Ollama Service — FREE LLM Fallback"
echo "Starting Ollama server..."

# Start Ollama server in the background
ollama serve &
SERVER_PID=$!

# Wait for server to be ready (up to 60 seconds)
echo "Waiting for Ollama server to start..."
MAX_RETRIES=60
RETRY_COUNT=0
while ! curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: Ollama server failed to start after ${MAX_RETRIES} seconds"
    exit 1
  fi
  sleep 1
done
echo "Ollama server is ready!"

# Pull the default model
MODEL="${OLLAMA_MODEL:-llama3.2}"
echo "Pulling model: ${MODEL}..."
ollama pull "${MODEL}"
echo "Model ${MODEL} pulled successfully!"

# Optionally pull a second model
if [ -n "${OLLAMA_MODEL_2}" ]; then
  echo "Pulling secondary model: ${OLLAMA_MODEL_2}..."
  ollama pull "${OLLAMA_MODEL_2}"
  echo "Secondary model ${OLLAMA_MODEL_2} pulled!"
fi

echo "BLOOM Ollama Service is READY"
echo "Model: ${MODEL}"
echo "Endpoint: http://0.0.0.0:11434"
echo "OpenAI-compat: http://0.0.0.0:11434/v1/chat/completions"

# Keep server running
wait $SERVER_PID
