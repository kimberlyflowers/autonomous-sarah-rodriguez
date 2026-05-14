import base64
import os
import tempfile
import subprocess
import runpod


def handler(event):
    data = event.get("input", {}) or {}
    url = data.get("url")
    if not url:
        return {"error": "url is required"}

    audio_only = bool(data.get("audio_only", False))
    max_duration = int(data.get("max_duration", 180))
    suffix = "mp3" if audio_only else "mp4"

    with tempfile.TemporaryDirectory() as tmpdir:
        output_template = os.path.join(tmpdir, "source.%(ext)s")
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--max-filesize", str(data.get("max_filesize", "500M")),
            "--download-sections", f"*0-{max_duration}",
            "-o", output_template,
        ]
        if audio_only:
            cmd += ["-x", "--audio-format", "mp3"]
        else:
            cmd += ["-f", "mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best", "--merge-output-format", "mp4"]
        cmd.append(url)

        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=int(data.get("timeout", 900)))
        if proc.returncode != 0:
            return {"error": proc.stderr[-2000:] or proc.stdout[-2000:] or "yt-dlp failed"}

        files = [os.path.join(tmpdir, name) for name in os.listdir(tmpdir) if os.path.isfile(os.path.join(tmpdir, name))]
        if not files:
            return {"error": "download completed but no output file was found"}
        file_path = max(files, key=os.path.getsize)
        mime = "audio/mpeg" if audio_only else "video/mp4"
        encoded = base64.b64encode(open(file_path, "rb").read()).decode("utf-8")
        return {
            "url": f"data:{mime};base64,{encoded}",
            "mime_type": mime,
            "file_name": f"source.{suffix}",
            "size_bytes": os.path.getsize(file_path)
        }


runpod.serverless.start({"handler": handler})
