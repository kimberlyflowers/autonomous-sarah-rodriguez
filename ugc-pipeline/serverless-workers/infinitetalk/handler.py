"""Bloom Studio native-720p InfiniteTalk worker for RunPod Serverless.

The worker intentionally returns the model's native 720p render. Face restoration
and frame-by-frame upscaling are disabled because they can introduce temporal eye
and skin artifacts. The first production contract is a short talking-head clip;
long videos should be moved to object storage instead of being returned as base64.
"""

from __future__ import annotations

import base64
import json
import math
import os
import random
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

import requests
import runpod
from PIL import Image, ImageOps


VOLUME_ROOT = Path(os.environ.get("VOLUME_ROOT", "/runpod-volume"))
INFINITETALK_DIR = Path(
    os.environ.get("INFINITETALK_DIR", str(VOLUME_ROOT / "InfiniteTalk"))
)
PYTHON_BIN = os.environ.get("INFINITETALK_PYTHON", "python3")
RENDER_TIMEOUT_SECONDS = int(os.environ.get("INFINITETALK_RENDER_TIMEOUT", "3600"))
MAX_AUDIO_SECONDS = float(os.environ.get("INFINITETALK_MAX_AUDIO_SECONDS", "60"))
MAX_DOWNLOAD_BYTES = int(os.environ.get("INFINITETALK_MAX_DOWNLOAD_BYTES", str(80 * 1024 * 1024)))

MODELS = {
    "wan": Path(os.environ.get(
        "WAN_MODEL_DIR", str(VOLUME_ROOT / "models/Wan2.1-I2V-14B-480P")
    )),
    "wav2vec": Path(os.environ.get(
        "WAV2VEC_MODEL_DIR", str(VOLUME_ROOT / "models/chinese-wav2vec2-base")
    )),
    "infinitetalk": Path(os.environ.get(
        "INFINITETALK_MODEL_PATH",
        str(VOLUME_ROOT / "models/InfiniteTalk/single/infinitetalk.safetensors"),
    )),
}
DEFAULT_IMAGE = Path(
    os.environ.get("INFINITETALK_DEFAULT_IMAGE", str(VOLUME_ROOT / "input/sarah_heygen.png"))
)


def require_runtime() -> None:
    required = {
        "InfiniteTalk checkout": INFINITETALK_DIR / "generate_infinitetalk.py",
        "Wan base model": MODELS["wan"],
        "wav2vec model": MODELS["wav2vec"],
        "InfiniteTalk weights": MODELS["infinitetalk"],
    }
    missing = [f"{label}: {path}" for label, path in required.items() if not path.exists()]
    if missing:
        raise RuntimeError("RunPod model volume is incomplete. Missing " + "; ".join(missing))


def download_file(url: str, destination: Path, label: str) -> None:
    if not url.startswith(("https://", "http://")):
        raise ValueError(f"{label} URL must use http or https")

    with requests.get(url, timeout=(15, 180), stream=True, allow_redirects=True) as response:
        response.raise_for_status()
        declared_size = int(response.headers.get("content-length", "0") or 0)
        if declared_size > MAX_DOWNLOAD_BYTES:
            raise ValueError(f"{label} is larger than the {MAX_DOWNLOAD_BYTES // (1024 * 1024)} MB limit")

        bytes_written = 0
        with destination.open("wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                bytes_written += len(chunk)
                if bytes_written > MAX_DOWNLOAD_BYTES:
                    raise ValueError(f"{label} exceeded the {MAX_DOWNLOAD_BYTES // (1024 * 1024)} MB limit")
                output.write(chunk)

    if bytes_written == 0:
        raise ValueError(f"{label} download was empty")


def normalize_image(source: Path, destination: Path) -> None:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        width, height = image.size
        if width < 512 or height < 512:
            raise ValueError(f"Reference image is too small ({width}x{height}); use at least 512x512")
        if width * height > 40_000_000:
            raise ValueError(f"Reference image is too large ({width}x{height})")
        image.save(destination, format="PNG", optimize=True)


def normalize_audio(source: Path, destination: Path) -> None:
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        str(destination),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False)
    if result.returncode != 0 or not destination.exists():
        raise ValueError(f"Audio conversion failed: {result.stderr[-500:]}")


def media_duration_seconds(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    try:
        duration = float(result.stdout.strip())
    except (TypeError, ValueError) as error:
        raise ValueError("Could not determine the audio duration") from error
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Audio must have a positive duration")
    if duration > MAX_AUDIO_SECONDS:
        raise ValueError(f"Audio is {duration:.1f}s; this endpoint is limited to {MAX_AUDIO_SECONDS:.0f}s")
    return duration


def max_frame_num(duration_seconds: float) -> int:
    """Round 25fps duration up to InfiniteTalk's required 4n+1 frame count."""
    requested = max(81, math.ceil(duration_seconds * 25))
    return math.ceil((requested - 1) / 4) * 4 + 1


def probe_video(path: Path) -> tuple[int, int, float]:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height:format=duration", "-of", "json", str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Output validation failed: {result.stderr[-500:]}")
    payload = json.loads(result.stdout or "{}")
    streams = payload.get("streams") or []
    if not streams:
        raise RuntimeError("Output validation found no video stream")
    width = int(streams[0].get("width") or 0)
    height = int(streams[0].get("height") or 0)
    duration = float((payload.get("format") or {}).get("duration") or 0)
    if min(width, height) < 700:
        raise RuntimeError(f"InfiniteTalk returned {width}x{height}, not native 720p")
    return width, height, duration


def run_infinitetalk(
    image_path: Path,
    audio_path: Path,
    work_dir: Path,
    prompt: str,
    steps: int,
    seed: int,
    duration_seconds: float,
) -> Path:
    input_json_path = work_dir / "input.json"
    output_stem = work_dir / "native-720p"
    output_path = Path(f"{output_stem}.mp4")
    input_json_path.write_text(
        json.dumps(
            {
                "prompt": prompt,
                "cond_video": str(image_path),
                "cond_audio": {"person1": str(audio_path)},
            }
        ),
        encoding="utf-8",
    )

    command = [
        PYTHON_BIN,
        "generate_infinitetalk.py",
        "--ckpt_dir", str(MODELS["wan"]),
        "--wav2vec_dir", str(MODELS["wav2vec"]),
        "--infinitetalk_dir", str(MODELS["infinitetalk"]),
        "--input_json", str(input_json_path),
        "--size", "infinitetalk-720",
        "--sample_steps", str(steps),
        "--mode", "clip" if duration_seconds <= 3.2 else "streaming",
        "--motion_frame", "9",
        "--max_frame_num", str(max_frame_num(duration_seconds)),
        "--sample_audio_guide_scale", "4",
        "--save_file", str(output_stem),
        "--base_seed", str(seed),
    ]

    print(
        "[InfiniteTalk] starting native 720p render",
        json.dumps({"steps": steps, "seed": seed, "duration_seconds": round(duration_seconds, 2)}),
        flush=True,
    )
    result = subprocess.run(
        command,
        cwd=INFINITETALK_DIR,
        capture_output=True,
        text=True,
        timeout=RENDER_TIMEOUT_SECONDS,
        check=False,
    )
    if result.returncode != 0:
        print(f"[InfiniteTalk] stderr: {result.stderr[-4000:]}", flush=True)
        raise RuntimeError(f"InfiniteTalk exited with code {result.returncode}: {result.stderr[-1200:]}")
    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"InfiniteTalk completed but did not create {output_path.name}")
    return output_path


def handler(job: dict[str, Any]) -> dict[str, Any]:
    payload = job.get("input") or {}
    audio_url = str(payload.get("audio_url") or "").strip()
    image_url = str(payload.get("image_url") or "").strip()
    requested_quality = str(payload.get("quality") or "720p").lower()

    if not audio_url:
        return {"error": "audio_url is required"}
    if requested_quality != "720p":
        return {"error": "This endpoint produces native 720p only. Send quality: '720p'."}

    try:
        steps = max(20, min(50, int(payload.get("steps", 40))))
        seed = int(payload.get("seed", -1))
    except (TypeError, ValueError):
        return {"error": "steps and seed must be integers"}
    if seed < 0:
        seed = random.randint(0, 99_999_999)

    prompt = str(payload.get("prompt") or (
        "A polished receptionist speaks naturally to the camera with subtle head movement, "
        "steady eye contact, realistic blinking, stable facial identity, and a locked camera."
    )).strip()[:1000]

    try:
        require_runtime()
        with tempfile.TemporaryDirectory(prefix=f"bloom-{uuid.uuid4().hex[:8]}-") as raw_work_dir:
            work_dir = Path(raw_work_dir)
            downloaded_audio = work_dir / "audio-download"
            audio_path = work_dir / "speech.wav"
            download_file(audio_url, downloaded_audio, "Audio")
            normalize_audio(downloaded_audio, audio_path)
            duration = media_duration_seconds(audio_path)

            if image_url:
                downloaded_image = work_dir / "image-download"
                image_path = work_dir / "reference.png"
                download_file(image_url, downloaded_image, "Image")
                normalize_image(downloaded_image, image_path)
            else:
                if not DEFAULT_IMAGE.exists():
                    raise RuntimeError("image_url is required because the default Sarah image is not installed")
                image_path = work_dir / "reference.png"
                normalize_image(DEFAULT_IMAGE, image_path)

            video_path = run_infinitetalk(
                image_path=image_path,
                audio_path=audio_path,
                work_dir=work_dir,
                prompt=prompt,
                steps=steps,
                seed=seed,
                duration_seconds=duration,
            )
            width, height, output_duration = probe_video(video_path)
            file_size_bytes = video_path.stat().st_size
            print(
                "[InfiniteTalk] native 720p render complete",
                json.dumps({"width": width, "height": height, "bytes": file_size_bytes}),
                flush=True,
            )
            return {
                "video_b64": base64.b64encode(video_path.read_bytes()).decode("ascii"),
                "format": "mp4",
                "quality": "720p",
                "render_res": "720p",
                "width": width,
                "height": height,
                "duration_seconds": round(output_duration, 3),
                "file_size_mb": round(file_size_bytes / (1024 * 1024), 2),
                "seed": seed,
            }
    except subprocess.TimeoutExpired:
        return {"error": f"Render exceeded the {RENDER_TIMEOUT_SECONDS}s worker timeout"}
    except Exception as error:
        return {"error": str(error)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
