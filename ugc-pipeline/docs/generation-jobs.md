# Generation Job Architecture

All expensive generation work must run as a background job.

This includes video, image, audio, document, slide deck, and future RunPod or third-party generation endpoints. A user should never be trapped on a modal, page, or open HTTP request while a model renders.

Required flow:

1. Validate required inputs synchronously.
2. Create a durable job record immediately with `processing` status.
3. Return the job to the UI immediately.
4. Show a Library card or equivalent job card with the attempted subject/image, provider, elapsed time, and "safe to leave this panel" copy.
5. Run the provider call in the background.
6. Update the job to `completed` with output asset metadata, or `failed` with the full provider error.
7. The UI polls job status and notifies when the job completes or fails.

Error UX requirements:

- Failed jobs must never look like processing jobs.
- Failed jobs must show a clear failed badge or overlay.
- Full provider errors must be expandable and copyable.
- If an attempted character/image/reference exists, the failed job card should show it so the user knows which generation failed.

Do not add new synchronous generation routes unless the work is guaranteed to complete in a few seconds and does not call an external model/rendering service.
