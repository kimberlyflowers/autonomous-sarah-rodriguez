---
name: bloom-studio-video
description: Generate an approved video with the active Bloomie employee in BLOOM Studio.
required_tools: [bloom_studio_generate_video, bloom_studio_check_job]
---

# BLOOM Studio Video

1. Draft the spoken script in chat and wait for the user's explicit approval before generating.
2. Call `bloom_studio_generate_video` with the approved script. Omit `imageUrl` when the user asks for a video of the active Bloomie; the platform securely uses that employee's own saved reference image and voice.
3. Poll `bloom_studio_check_job` using the returned request ID. Give rendering enough time and continue until the job is completed or failed.
4. Return the real finished video URL or the exact verified failure. Never call the legacy `video_generate` tool for BLOOM Studio and never silently switch to HeyGen.

