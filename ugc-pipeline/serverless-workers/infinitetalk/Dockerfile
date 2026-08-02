# Bloom Studio InfiniteTalk native-720p worker.
# Model weights stay on a RunPod network volume and are installed with
# bootstrap-volume.sh. This image only contains the deterministic runtime.
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

ARG INFINITETALK_COMMIT=50aa0a94184315407a991ae804d9b58d6d311ba8

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/MeiGen-AI/InfiniteTalk.git /opt/InfiniteTalk \
    && git -C /opt/InfiniteTalk checkout "${INFINITETALK_COMMIT}" \
    && pip install --no-cache-dir runpod requests Pillow \
    && pip install --no-cache-dir xformers==0.0.27.post2 \
    && pip install --no-cache-dir -r /opt/InfiniteTalk/requirements.txt \
    && pip install --no-cache-dir misaki[en] ninja psutil packaging wheel librosa soundfile \
    && MAX_JOBS=4 pip install --no-cache-dir flash_attn==2.7.4.post1 --no-build-isolation

COPY handler.py /opt/bloom-infinitetalk/handler.py

ENV VOLUME_ROOT=/runpod-volume \
    INFINITETALK_DIR=/opt/InfiniteTalk \
    INFINITETALK_RENDER_TIMEOUT=3600 \
    INFINITETALK_MAX_AUDIO_SECONDS=60

VOLUME ["/runpod-volume"]
CMD ["python3", "-u", "/opt/bloom-infinitetalk/handler.py"]
