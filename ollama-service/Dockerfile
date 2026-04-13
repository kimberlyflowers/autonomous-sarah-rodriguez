# BLOOM Ollama Service — FREE LLM Fallback
# Deploy as a separate Railway service in the same project.
# Internal URL: http://bloom-ollama.railway.internal:11434

FROM ollama/ollama:latest

ENV OLLAMA_HOST=0.0.0.0:11434
ENV OLLAMA_KEEP_ALIVE=24h
ENV OLLAMA_NUM_PARALLEL=4
ENV OLLAMA_MAX_LOADED_MODELS=2

RUN mkdir -p /root/.ollama/models

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 11434

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -sf http://localhost:11434/api/tags || exit 1

CMD ["/start.sh"]
