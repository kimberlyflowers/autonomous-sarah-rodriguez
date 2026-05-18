# MuseTalk Endpoint Contract

Bloom Studio treats MuseTalk as a prerecorded lip-sync renderer, not only a live avatar system. A request should provide a source avatar image or talking-head video plus an audio file, then the endpoint returns a rendered MP4.

## Required Railway Variables

- `RUNPOD_MUSETALK_ENDPOINT_ID` or `RUNPOD_MUSETALK_ENDPOINT_URL`
- `RUNPOD_MUSETALK_API_KEY`, or fallback `RUNPOD_API_KEY`

Optional:

- `RUNPOD_MUSETALK_TIMEOUT_MS`
- `RUNPOD_MUSETALK_POLL_INTERVAL_MS`

## Request Shape

Bloom Studio submits to RunPod serverless using the standard `/run` job endpoint:

```json
{
  "input": {
    "prompt": "Natural talking-head lip sync, preserve identity, steady face framing.",
    "fps": 25,
    "bbox_shift": 0,
    "image_url": "https://...",
    "source_url": "https://...",
    "video_path": "https://...",
    "audio_url": "https://...",
    "audio_path": "https://..."
  }
}
```

`source_url` and `video_path` are sent as aliases so a worker based on `PunithVT/ai-avatar-system` can map either image or video-style inputs without changing Bloom Studio again.

## Response Shape

The handler can return any of these common fields:

```json
{
  "output": {
    "video_b64": "<base64 mp4>",
    "output_video_b64": "<base64 mp4>",
    "video_url": "https://...",
    "video": "https://..."
  }
}
```

Bloom Studio saves the completed video to Library under the `musetalk` provider folder.

## Warm Workers

Bloom Studio does not keep MuseTalk warm. RunPod keeps the model warm when the serverless endpoint has an active worker, min worker, or retained worker. If there are zero workers, the first request cold-starts and loads MuseTalk models before rendering.
