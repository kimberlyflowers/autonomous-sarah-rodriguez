# Bloom Studio InfiniteTalk native-720p worker.
# Model weights stay on a RunPod network volume and are installed with
# bootstrap-volume.sh. This image only contains the deterministic runtime.
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

ARG INFINITETALK_COMMIT=50aa0a94184315407a991ae804d9b58d6d311ba8

COPY constraints.txt /opt/bloom-infinitetalk/constraints.txt

ENV PIP_CONSTRAINT=/opt/bloom-infinitetalk/constraints.txt

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/MeiGen-AI/InfiniteTalk.git /opt/InfiniteTalk \
    && git -C /opt/InfiniteTalk checkout "${INFINITETALK_COMMIT}" \
    && pip install --no-cache-dir runpod requests Pillow \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cu124 xformers==0.0.28.post1 \
    && pip install --no-cache-dir --no-deps "https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1%2Bcu12torch2.4cxx11abiFALSE-cp311-cp311-linux_x86_64.whl" \
    && pip install --no-cache-dir -r /opt/InfiniteTalk/requirements.txt \
    && pip install --no-cache-dir misaki[en] ninja psutil packaging wheel librosa soundfile \
    && python3 -c "import flash_attn, torch, xformers; assert torch.__version__.startswith('2.4.1'); assert torch.version.cuda == '12.4'; print('validated torch', torch.__version__, 'cuda', torch.version.cuda, 'xformers', xformers.__version__, 'flash_attn', flash_attn.__version__)"

COPY handler.py /opt/bloom-infinitetalk/handler.py

ENV VOLUME_ROOT=/runpod-volume \
    INFINITETALK_DIR=/opt/InfiniteTalk \
    INFINITETALK_RENDER_TIMEOUT=3600 \
    INFINITETALK_MAX_AUDIO_SECONDS=60

VOLUME ["/runpod-volume"]
CMD ["python3", "-u", "/opt/bloom-infinitetalk/handler.py"]
