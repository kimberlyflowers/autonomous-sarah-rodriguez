---
name: heygen-video
description: Create and monitor realistic avatar videos with the current tenant's connected HeyGen account. Use for HeyGen, AI avatar, digital twin, talking-avatar, or agent-self video requests.
version: 1.0.0
workflow_type: tenant_heygen_video
required_tools: [heygen_list_avatars, heygen_list_voices, heygen_create_video, heygen_get_video]
---

# HeyGen Video

Use HeyGen API v3 only and use the current organization's tenant-scoped connection.

1. Identify the intended person, script, orientation, visual setting, and delivery style.
2. Call `heygen_list_avatars` with `ownership: private`. For a self-video, use `recommendedForActiveAgent` when present; otherwise select the person's existing private avatar by evidence from its name and preview. Never silently substitute a public avatar for a requested person.
3. Call `heygen_list_voices`. Prefer the avatar's default voice when it is available; otherwise choose a voice that clearly matches the request.
4. Before creating a video, confirm any genuinely missing identity choice, script approval requirement, or paid-generation decision. Do not ask for information the tools can discover.
5. Call `heygen_create_video` with a complete script, avatar look ID, voice ID, aspect ratio, and descriptive title.
6. Poll with `heygen_get_video` until the video is completed, failed, or the tool reports a pending timeout. A pending timeout is not a failure; continue polling after a reasonable wait.
7. Report the real HeyGen video ID, status, and returned video URL. Never invent a URL or claim completion from the create response alone.

Creating or training a new likeness requires the person's consent and an approved source asset. Do not create a new avatar just because a matching private avatar was not found.
