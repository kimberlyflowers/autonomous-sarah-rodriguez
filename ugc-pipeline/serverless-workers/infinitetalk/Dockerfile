# BLOOM InfiniteTalk Serverless Worker
# Requires network volume agy7kv4bgk mounted at /runpod-volume
# Volume must contain:
#   /runpod-volume/InfiniteTalk/          - cloned MeiGen-AI/InfiniteTalk repo
#   /runpod-volume/models/Wan2.1-I2V-14B-480P/
#   /runpod-volume/models/chinese-wav2vec2-base/
#   /runpod-volume/models/InfiniteTalk/single/infinitetalk.safetensors
#   /runpod-volume/input/sarah_heygen.png
#   /usr/local/bin/realesrgan-ncnn-vulkan (installed below)

FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

# System deps
RUN apt-get update && apt-get install -y \
    ffmpeg git wget curl unzip libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Real-ESRGAN binary (Linux x86_64, Vulkan)
RUN wget -q https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip \
    -O /tmp/realesrgan.zip \
    && unzip -q /tmp/realesrgan.zip -d /tmp/realesrgan \
    && mv /tmp/realesrgan/realesrgan-ncnn-vulkan /usr/local/bin/ \
    && chmod +x /usr/local/bin/realesrgan-ncnn-vulkan \
    && mv /tmp/realesrgan/models /usr/local/share/realesrgan-models \
    && rm -rf /tmp/realesrgan /tmp/realesrgan.zip

# Python deps
RUN pip install --no-cache-dir \
    runpod \
    requests \
    torch torchvision \
    transformers \
    accelerate \
    diffusers \
    imageio \
    imageio-ffmpeg \
    Pillow \
    numpy \
    einops \
    safetensors \
    sentencepiece \
    basicsr \
    facexlib \
    gfpgan

# CodeFormer deps
RUN pip install --no-cache-dir tb-nightly -i https://pypi.tuna.tsinghua.edu.cn/simple || true \
    && pip install --no-cache-dir addict yapf lmdb

COPY handler.py /handler.py

# Volume mount point
VOLUME ["/runpod-volume"]

ENV VOLUME_ROOT=/runpod-volume

CMD ["python3", "-u", "/handler.py"]
