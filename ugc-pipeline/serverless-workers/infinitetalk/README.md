# Bloom Studio InfiniteTalk 720p worker

This worker runs the official InfiniteTalk `infinitetalk-720` path and rejects
any output whose shorter side is below 700 pixels. It deliberately skips
CodeFormer and Real-ESRGAN so the endpoint does not introduce frame-to-frame eye
or face-restoration artifacts.

The Docker image and volume bootstrap both pin InfiniteTalk commit
`50aa0a94184315407a991ae804d9b58d6d311ba8`. The model weights remain on a
RunPod network volume mounted at `/runpod-volume`; run `bootstrap-volume.sh`
once on a temporary Pod to populate that volume. The bootstrap also creates a
volume-resident runtime at `/runpod-volume/bloom-infinitetalk/start.sh`, so the
surviving endpoint can use RunPod's PyTorch image without waiting for a custom
container build. Only the single-person InfiniteTalk checkpoint is downloaded;
the unused multi-person and quantized checkpoints are not stored on the volume.

The runtime also constrains PyTorch to 2.4.1 on CUDA 12.4, uses the matching
xformers wheel, and installs the official prebuilt FlashAttention wheel. This
prevents newer transitive dependencies from replacing PyTorch with an
incompatible CUDA 13 build during a GitHub-triggered RunPod build.

Serverless input:

```json
{
  "input": {
    "audio_url": "https://example.com/short-speech.mp3",
    "image_url": "https://example.com/portrait.png",
    "quality": "720p",
    "steps": 40,
    "seed": -1
  }
}
```

The response contains `video_b64`, `width`, `height`, and `render_res: "720p"`.
The initial Bloom Studio contract is capped at 60 seconds because RunPod queue
results are returned inline. A later long-video contract should upload the MP4
to object storage and return a signed URL instead.
