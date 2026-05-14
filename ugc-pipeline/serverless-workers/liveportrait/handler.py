import runpod
import subprocess
import base64
import os
import tempfile
import requests

def download_file(url, dest):
      r = requests.get(url, timeout=60)
      r.raise_for_status()
      with open(dest, 'wb') as f:
                f.write(r.content)

  def handler(job):
        inp = job.get("input", {})
        source_url = inp.get("source_image")
        driving_url = inp.get("driving_video")

    if not source_url or not driving_url:
              return {"error": "source_image and driving_video are required"}

    with tempfile.TemporaryDirectory() as tmp:
              source_path = os.path.join(tmp, "source.jpg")
              driving_path = os.path.join(tmp, "driving.mp4")
              output_path = os.path.join(tmp, "output.mp4")

        download_file(source_url, source_path)
        download_file(driving_url, driving_path)

        cmd = [
                      "python", "/app/LivePortrait/inference.py",
                      "-s", source_path,
                      "-d", driving_path,
                      "-o", output_path,
                      "--flag_crop_driving_video"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/app/LivePortrait")

        if result.returncode != 0:
                      return {"error": result.stderr[-2000:]}

        with open(output_path, "rb") as f:
                      video_b64 = base64.b64encode(f.read()).decode()

        return {"output_video_b64": video_b64, "format": "mp4"}

runpod.serverless.start({"handler": handler})
