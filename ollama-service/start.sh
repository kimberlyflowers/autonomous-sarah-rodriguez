#!/bin/bash
# BLOOM Ollama Startup Script
# Model is pre-baked into the image during docker build.
Fix start.sh: use 127.0.0.1 not localhost, increase MAX_RETRIES to 120
echo "BLOOM Ollama Service — FREE LLM Fallback"
echo "Starting Ollama server..."

# Start Ollama server in the background
ollama serve &
SERVER_PID=$!

# Wait for server to be ready (up to 30 seconds)
echo "Waiting for Ollama server to start..."
MAX_RETRIES=120
RETRY_COUNT=0
while ! curl -sf http://127.0.0.1:11434/api/tags > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: Ollama server failed to start after ${MAX_RETRIES} seconds"
    exit 1
  fi
  sleep 1
done
echo "Ollama server is ready!"

# Pull primary model at runtime
MODEL=${OLLAMA_MODEL:-llama3.2}
echo "Pulling model: $MODEL..." || echo "Pull failed, continuing anyway - model may already be cached"
ollama pull "$MODEL" || true
echo "Model $MODEL ready!"

# Pull any additional model if requested (already have llama3.2 baked in)
if [ -n "${OLLAMA_MODEL_2}" ]; then
  echo "Pulling secondary model: ${OLLAMA_MODEL_2}..."
  ollama pull "${OLLAMA_MODEL_2}"
  echo "Secondary model ${OLLAMA_MODEL_2} pulled!"
fi

MODEL="${OLLAMA_MODEL:-llama3.2}"
echo "BLOOM Ollama Service is READY"
echo "Model: ${MODEL}"
echo "Endpoint: http://0.0.0.0:11434"
echo "OpenAI-compat: http://0.0.0.0:11434/v1/chat/completions"

# Keep server running
wait $SERVER_PID
