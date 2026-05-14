FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir runpod yt-dlp
WORKDIR /app
COPY handler.py /app/handler.py
CMD ["python", "handler.py"]
