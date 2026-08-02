#!/usr/bin/env bash
set -euo pipefail

volume_root="${VOLUME_ROOT:-/runpod-volume}"
model_root="${volume_root}/models"
input_root="${volume_root}/input"
runtime_root="${volume_root}/bloom-infinitetalk"
infinitetalk_commit="${INFINITETALK_COMMIT:-50aa0a94184315407a991ae804d9b58d6d311ba8}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "${model_root}" "${input_root}" "${runtime_root}"

if [[ ! -d "${runtime_root}/InfiniteTalk/.git" ]]; then
  git clone https://github.com/MeiGen-AI/InfiniteTalk.git "${runtime_root}/InfiniteTalk"
fi
git -C "${runtime_root}/InfiniteTalk" fetch --depth 1 origin "${infinitetalk_commit}"
git -C "${runtime_root}/InfiniteTalk" checkout --detach "${infinitetalk_commit}"

python3 -m venv --system-site-packages "${runtime_root}/venv"
"${runtime_root}/venv/bin/pip" install --no-cache-dir --upgrade pip wheel packaging
"${runtime_root}/venv/bin/pip" install --no-cache-dir runpod requests Pillow
"${runtime_root}/venv/bin/pip" install --no-cache-dir xformers==0.0.27.post2
"${runtime_root}/venv/bin/pip" install --no-cache-dir \
  -r "${runtime_root}/InfiniteTalk/requirements.txt" \
  misaki[en] ninja psutil librosa soundfile
MAX_JOBS="${MAX_JOBS:-4}" "${runtime_root}/venv/bin/pip" install --no-cache-dir \
  flash_attn==2.7.4.post1 --no-build-isolation

install -m 0644 "${script_dir}/handler.py" "${runtime_root}/handler.py"

python3 -m pip install --no-cache-dir "huggingface_hub[cli]>=0.27,<1"

huggingface-cli download Wan-AI/Wan2.1-I2V-14B-480P \
  --local-dir "${model_root}/Wan2.1-I2V-14B-480P"
huggingface-cli download TencentGameMate/chinese-wav2vec2-base \
  --local-dir "${model_root}/chinese-wav2vec2-base"
huggingface-cli download TencentGameMate/chinese-wav2vec2-base model.safetensors \
  --revision refs/pr/1 \
  --local-dir "${model_root}/chinese-wav2vec2-base"
huggingface-cli download MeiGen-AI/InfiniteTalk single/infinitetalk.safetensors \
  --local-dir "${model_root}/InfiniteTalk"

test -d "${model_root}/Wan2.1-I2V-14B-480P"
test -f "${model_root}/chinese-wav2vec2-base/model.safetensors"
test -f "${model_root}/InfiniteTalk/single/infinitetalk.safetensors"

cat > "${runtime_root}/start.sh" <<'START_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
export VOLUME_ROOT="${VOLUME_ROOT:-/runpod-volume}"
export INFINITETALK_DIR="${VOLUME_ROOT}/bloom-infinitetalk/InfiniteTalk"
exec "${VOLUME_ROOT}/bloom-infinitetalk/venv/bin/python" -u \
  "${VOLUME_ROOT}/bloom-infinitetalk/handler.py"
START_SCRIPT
chmod 0755 "${runtime_root}/start.sh"

echo "InfiniteTalk 720p runtime and models are ready at ${volume_root}."
