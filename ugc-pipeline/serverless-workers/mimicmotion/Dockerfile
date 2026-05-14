FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg libgl1 libglib2.0-0 wget ca-certificates \
        && rm -rf /var/lib/apt/lists/*

        RUN pip install --no-cache-dir runpod requests torch torchvision --index-url https://download.pytorch.org/whl/cu121

        RUN git clone https://github.com/Tencent/MimicMotion /app/MimicMotion
        WORKDIR /app/MimicMotion
        RUN pip install --no-cache-dir -r requirements.txt

        COPY handler.py /app/handler.py
        WORKDIR /app
        CMD ["python", "handler.py"]
