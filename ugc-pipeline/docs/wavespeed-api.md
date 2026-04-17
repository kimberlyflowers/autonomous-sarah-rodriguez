# WaveSpeed API — Seedance 2.0 Reference

## Base URL
`https://api.wavespeed.ai/api/v3`

## Authentication
```
Authorization: Bearer ${WAVESPEED_API_KEY}
Content-Type: application/json
```
Get key at https://wavespeed.ai/accesskey

---

## Endpoints

### Image-to-Video (Standard)
**POST** `/bytedance/seedance-2.0/image-to-video`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `prompt` | string | yes | — | Cinematic scene description |
| `image` | string | yes | — | Start frame URL |
| `last_image` | string | no | — | Final frame URL |
| `aspect_ratio` | string | no | auto | `16:9`, `9:16`, `4:3`, `3:4`, `1:1`, `21:9` |
| `resolution` | string | no | `720p` | `480p`, `720p`, `1080p` |
| `duration` | int | no | `5` | `5`, `10`, `15` seconds |
| `enable_web_search` | bool | no | `false` | |

### Image-to-Video (Fast — cheaper)
**POST** `/bytedance/seedance-2.0-fast/image-to-video`
Same payload as standard.

### Text-to-Video (Multi-reference)
**POST** `/bytedance/seedance-2.0/text-to-video`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `prompt` | string | yes | — | |
| `reference_images` | array<string> | no | — | Image URLs for style |
| `reference_videos` | array<string> | no | — | Max 15s total |
| `reference_audios` | array<string> | no | — | Max 15s total |
| `aspect_ratio` | string | no | `16:9` | |
| `resolution` | string | no | `720p` | |
| `duration` | int | no | `5` | |

### Poll Result
**GET** `/predictions/{id}/result`
Header: `Authorization: Bearer ${WAVESPEED_API_KEY}`

---

## Submit Response
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "prediction_id",
    "model": "bytedance/seedance-2.0/image-to-video",
    "outputs": [],
    "urls": { "get": "https://api.wavespeed.ai/api/v3/predictions/{id}/result" },
    "has_nsfw_contents": [],
    "status": "created",
    "created_at": "2026-04-17T12:00:00Z",
    "error": "",
    "timings": { "inference": 0 }
  }
}
```

## Status Values
`created` → `processing` → `completed` | `failed`

When `completed`, `outputs` array contains video URLs.

## Error Codes
| Code | Meaning |
|---|---|
| 200 | Success |
| 400 | Invalid parameters |
| 401 | Invalid API key |
| 403 | Account issue |
| 429 | Rate limit |
| 500 | Server error |

---

## Pricing

### Standard
| Resolution | 5s | 10s | 15s | Per Second |
|---|---|---|---|---|
| 480p | $0.60 | $1.20 | $1.80 | $0.12 |
| 720p | $1.20 | $2.40 | $3.60 | $0.24 |
| 1080p | $1.80 | $3.60 | $5.40 | $0.36 |

### Fast (recommended for ads)
| Resolution | 5s | 10s | 15s | Per Second |
|---|---|---|---|---|
| 480p | $0.50 | $1.00 | $1.50 | $0.10 |
| 720p | $1.00 | $2.00 | $3.00 | $0.20 |
| 1080p | $1.50 | $3.00 | $4.50 | $0.30 |

Reference videos double the cost on text-to-video.
