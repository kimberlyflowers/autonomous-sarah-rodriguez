"""
BLOOM InfiniteTalk Serverless Handler
RunPod serverless endpoint for WanVideo 2.1 InfiniteTalk lipsync.

Inputs:
  image_url   str  - Sarah reference image URL
  audio_url   str  - ElevenLabs audio URL (.mp3 or .wav)
  quality     str  - "720p" (default) or "1080p" (480p render + Real-ESRGAN 2x upscale)
  steps       int  - inference steps (default 40)
  seed        int  - -1 for random

Outputs:
  video_b64   str  - base64 encoded mp4
  format      str  - "mp4"
  resolution  str  - actual output resolution
  render_res  str  - resolution used for inference
"""

import runpod
import subprocess
import base64
import os
import json
import time
import uuid
import shutil
import tempfile
import requests

# ── Volume paths ───────────────────────────────────────────────────────────────
VOLUME_ROOT    = os.environ.get("VOLUME_ROOT", "/runpod-volume")
COMFYUI_DIR    = os.environ.get("COMFYUI_DIR", "/workspace/runpod-slim/ComfyUI")
INFINITETALK_DIR = os.path.join(VOLUME_ROOT, "InfiniteTalk")  # cloned repo on volume

# Model paths on volume
MODELS = {
    "wan_480p_dir":    os.path.join(VOLUME_ROOT, "models/Wan2.1-I2V-14B-480P"),
    "wav2vec_dir":     os.path.join(VOLUME_ROOT, "models/chinese-wav2vec2-base"),
    "infinitetalk":    os.path.join(VOLUME_ROOT, "models/InfiniteTalk/single/infinitetalk.safetensors"),
    "realesrgan":      "/usr/local/bin/realesrgan-ncnn-vulkan",
}

# Sarah default assets
SARAH_IMAGE    = os.path.join(VOLUME_ROOT, "input/sarah_heygen.png")


def download_file(url, dest_path, timeout=120):
    """Download a file from URL."""
    r = requests.get(url, timeout=timeout, stream=True)
    r.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=65536):
            f.write(chunk)


def run_infinitetalk(image_path, audio_path, output_path, size="infinitetalk-480", steps=40, seed=-1):
    """Run InfiniteTalk inference via generate_infinitetalk.py."""
    if seed == -1:
        import random
        seed = random.randint(0, 2**32 - 1)

    # Build input JSON for InfiniteTalk
    input_json = {
        "image": image_path,
        "audio": audio_path,
        "output": output_path,
    }
    input_json_path = output_path.replace(".mp4", "_input.json")
    with open(input_json_path, "w") as f:
        json.dump(input_json, f)

    cmd = [
        "python", "generate_infinitetalk.py",
        "--ckpt_dir",        MODELS["wan_480p_dir"],
        "--wav2vec_dir",     MODELS["wav2vec_dir"],
        "--infinitetalk_dir",MODELS["infinitetalk"],
        "--input_json",      input_json_path,
        "--size",            size,
        "--sample_steps",    str(steps),
        "--mode",            "streaming",
        "--motion_frame",    "9",
        "--sample_audio_guide_scale", "4",
        "--save_file",       output_path.replace(".mp4", ""),
        "--seed",            str(seed),
    ]

    print(f"[InfiniteTalk] Running: {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=INFINITETALK_DIR,
        capture_output=True,
        text=True,
        timeout=900  # 15 min max
    )

    if result.returncode != 0:
        print(f"[InfiniteTalk] STDERR: {result.stderr[-3000:]}")
        raise RuntimeError(f"InfiniteTalk failed: {result.stderr[-1000:]}")

    # InfiniteTalk appends _res.mp4 to save_file
    expected = output_path.replace(".mp4", "") + "_res.mp4"
    if os.path.exists(expected):
        return expected
    # fallback — check for any mp4 near output path
    parent = os.path.dirname(output_path)
    mp4s = [f for f in os.listdir(parent) if f.endswith(".mp4")]
    if mp4s:
        return os.path.join(parent, sorted(mp4s)[-1])
    raise RuntimeError("InfiniteTalk completed but no output mp4 found")


def run_codeformer(input_video, output_video, fidelity=0.7):
    """Run CodeFormer face restoration on every frame."""
    codeformer_script = os.path.join(VOLUME_ROOT, "CodeFormer/inference_codeformer.py")
    if not os.path.exists(codeformer_script):
        print("[CodeFormer] Not found, skipping face restoration")
        return input_video

    with tempfile.TemporaryDirectory() as frames_dir, \
         tempfile.TemporaryDirectory() as restored_dir:

        # Extract frames
        subprocess.run([
            "ffmpeg", "-y", "-i", input_video,
            "-q:v", "1", f"{frames_dir}/%05d.png"
        ], check=True, capture_output=True)

        # Run CodeFormer on frames directory
        result = subprocess.run([
            "python", codeformer_script,
            "--input_path", frames_dir,
            "--output_path", restored_dir,
            "--fidelity_weight", str(fidelity),
            "--face_upsample",
        ], cwd=os.path.join(VOLUME_ROOT, "CodeFormer"),
           capture_output=True, text=True, timeout=600)

        if result.returncode != 0:
            print(f"[CodeFormer] Failed: {result.stderr[-500:]}, skipping")
            return input_video

        # Re-encode to video (CodeFormer outputs to restored_faces subdir)
        restored_frames = os.path.join(restored_dir, "restored_faces")
        if not os.path.exists(restored_frames):
            restored_frames = restored_dir

        subprocess.run([
            "ffmpeg", "-y",
            "-framerate", "25",
            "-i", f"{restored_frames}/%05d.png",
            "-i", input_video,           # source audio
            "-map", "0:v", "-map", "1:a",
            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
            "-c:a", "copy",
            output_video
        ], check=True, capture_output=True)

    return output_video


def run_realesrgan(input_video, output_video, scale=2):
    """Upscale video using Real-ESRGAN frame by frame."""
    realesrgan_bin = MODELS["realesrgan"]
    if not os.path.exists(realesrgan_bin):
        print("[Real-ESRGAN] Binary not found, skipping upscale")
        return input_video

    with tempfile.TemporaryDirectory() as frames_in, \
         tempfile.TemporaryDirectory() as frames_out:

        # Extract frames
        subprocess.run([
            "ffmpeg", "-y", "-i", input_video,
            "-q:v", "1", f"{frames_in}/%05d.png"
        ], check=True, capture_output=True)

        # Upscale all frames
        result = subprocess.run([
            realesrgan_bin,
            "-i", frames_in,
            "-o", frames_out,
            "-n", "realesr-animevideov3-x2",
            "-s", str(scale),
            "-f", "png",
        ], capture_output=True, text=True, timeout=600)

        if result.returncode != 0:
            print(f"[Real-ESRGAN] Failed: {result.stderr[-300:]}, skipping upscale")
            return input_video

        # Re-encode
        subprocess.run([
            "ffmpeg", "-y",
            "-framerate", "25",
            "-i", f"{frames_out}/%05d.png",
            "-i", input_video,
            "-map", "0:v", "-map", "1:a",
            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
            "-c:a", "copy",
            output_video
        ], check=True, capture_output=True)

    return output_video


def handler(job):
    inp = job.get("input", {})

    image_url = inp.get("image_url")   # optional — defaults to Sarah
    audio_url = inp.get("audio_url")
    quality   = inp.get("quality", "720p")   # "720p" or "1080p"
    steps     = int(inp.get("steps", 40))
    seed      = int(inp.get("seed", -1))

    if not audio_url:
        return {"error": "audio_url is required"}

    # Quality → render resolution mapping
    # 720p: render at 720p natively (best quality at native res)
    # 1080p: render at 480p (within training dist) + Real-ESRGAN 2x → ~960p, pad to 1080p
    if quality == "1080p":
        render_size = "infinitetalk-480"
        render_res  = "480p"
        do_upscale  = True
    else:
        render_size = "infinitetalk-720"
        render_res  = "720p"
        do_upscale  = False

    with tempfile.TemporaryDirectory() as tmp:
        job_id     = str(uuid.uuid4())[:8]
        audio_path = os.path.join(tmp, f"audio_{job_id}.mp3")
        image_path = SARAH_IMAGE  # default

        # Download audio
        try:
            print(f"[InfiniteTalk] Downloading audio...")
            download_file(audio_url, audio_path)
        except Exception as e:
            return {"error": f"Audio download failed: {e}"}

        # Download custom image if provided
        if image_url:
            image_path = os.path.join(tmp, f"image_{job_id}.png")
            try:
                print(f"[InfiniteTalk] Downloading image...")
                download_file(image_url, image_path)
            except Exception as e:
                return {"error": f"Image download failed: {e}"}

        output_base = os.path.join(tmp, f"output_{job_id}.mp4")

        # ── Step 1: InfiniteTalk render ────────────────────────────────────────
        try:
            print(f"[InfiniteTalk] Rendering at {render_res}...")
            rendered = run_infinitetalk(
                image_path, audio_path, output_base,
                size=render_size, steps=steps, seed=seed
            )
            print(f"[InfiniteTalk] Render complete: {rendered}")
        except Exception as e:
            return {"error": f"Render failed: {e}"}

        current = rendered

        # ── Step 2: CodeFormer face restoration (both quality tiers) ──────────
        cf_out = os.path.join(tmp, f"codeformer_{job_id}.mp4")
        print("[InfiniteTalk] Running CodeFormer...")
        current = run_codeformer(current, cf_out, fidelity=0.7)

        # ── Step 3: Real-ESRGAN upscale (1080p only) ──────────────────────────
        if do_upscale:
            esr_out = os.path.join(tmp, f"upscaled_{job_id}.mp4")
            print("[InfiniteTalk] Running Real-ESRGAN 2x upscale...")
            current = run_realesrgan(current, esr_out, scale=2)

        # ── Read final video ───────────────────────────────────────────────────
        with open(current, "rb") as f:
            video_b64 = base64.b64encode(f.read()).decode()

        file_size_mb = os.path.getsize(current) / (1024 * 1024)
        print(f"[InfiniteTalk] Done. Output: {file_size_mb:.1f}MB")

        return {
            "video_b64":  video_b64,
            "format":     "mp4",
            "quality":    quality,
            "render_res": render_res,
            "file_size_mb": round(file_size_mb, 1),
        }


runpod.serverless.start({"handler": handler})
