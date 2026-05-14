# Bloom Studio Video Downloader Worker

RunPod serverless worker for remix source prep. It accepts a social/video URL and returns a data URL for either MP4 video or MP3 audio.

Input:

```json
{
  "input": {
    "url": "https://www.instagram.com/reel/...",
    "audio_only": true,
    "max_duration": 180
  }
}
```

Output:

```json
{
  "url": "data:audio/mpeg;base64,...",
  "mime_type": "audio/mpeg",
  "file_name": "source.mp3",
  "size_bytes": 12345
}
```

Use a CPU endpoint. Some platforms may block server-side downloads; when they do, upload the source video/audio directly in Bloom Studio.
