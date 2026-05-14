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
        pose_url = inp.get("pose_video")

    if not source_url or not pose_url:
              return {"error": "source_image and pose_video are required"}

    with tempfile.TemporaryDirectory() as tmp:
              source_path = os.path.join(tmp, "source.jpg")
              pose_path = os.path.join(tmp, "pose.mp4")
              output_path = os.path.join(tmp, "output.mp4")

        download_file(source_url, source_path)
        download_file(pose_url, pose_path)

        cmd = [
                      "python", "/app/MimicMotion/inference.py",
                      "--reference_image", source_path,
                      "--motion_video", pose_path,
                      "--output", output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/app/MimicMotion")

        if result.returncode != 0:
                      return {"error": result.stderr[-2000:]}

        with open(output_path, "rb") as f:
                      video_b64 = base64.b64encode(f.read()).decode()

        return {"output_video_b64": video_b64, "format": "mp4"}

runpod.serverless.start({"handler": handler})
