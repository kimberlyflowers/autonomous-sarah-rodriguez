---
name: hyperframes
description: Mandatory entry point for creating, editing, diagnosing, validating, previewing, or rendering seekable HTML video, animation, motion graphics, promos, explainers, title cards, overlays, slideshows, and other HyperFrames compositions.
version: 3.1.0
workflow_type: tenant_hyperframes
required_tools: [hyperframes_list_projects, hyperframes_catalog, hyperframes_add, hyperframes_clone_template, hyperframes_read_project, hyperframes_write_project, hyperframes_run]
---

# HyperFrames — shared Bloomie entry point

This skill applies to every Bloomie in Chat, Work, and Scheduled Tasks. HyperFrames renders video from HTML. A composition uses deterministic `data-*` timing and a seekable animation runtime. Use HyperFrames as the default output framework for HTML animation and motion graphics unless the user explicitly selects another framework or requests an avatar/talking-head generator such as BLOOM Studio or HeyGen.

## 1. Start from real project state

Apply the first matching rule:

1. **Specific operation on an existing project** — list and read the tenant's project with `hyperframes_list_projects` and `hyperframes_read_project`, then perform only the requested inspect, diagnose, validate, snapshot, render, or edit operation. Do not restart discovery.
2. **Specific edit to an existing project** — read the relevant files, preserve working structure, make the smallest complete edit, run `check`, and visually verify with `snapshot` when the change is visible.
3. **Existing project with `BRIEF.md`, `hyperframes.json`, or `STORYBOARD.md`** — resume those recorded decisions. Never overwrite a reusable template or finished composition when the user asked for a new deliverable; create a new tenant-isolated project slug instead.
4. **Fresh creation** — establish the subject, deliverable, aspect ratio/dimensions, duration, frame rate, visual direction, required media, and approval needs. Ask only for information that cannot safely be inferred.

Never access another organization's directory. Never use desktop shell tools. All project access must use the tenant-isolated HyperFrames tools.

### Where projects and templates live

- `hyperframes_list_projects` is the only source of truth for the current organization's writable projects. The server resolves the tenant folder; never guess or expose its filesystem path.
- `hyperframes_catalog` lists the current official HyperFrames blocks and components available as reusable starting points.
- `hyperframes_add` installs a selected official catalog item into the current tenant project.
- `hyperframes_clone_template` copies an approved read-only company template into a new tenant-owned project before customization.
- Approved company templates may appear in the template section returned by `hyperframes_list_projects`. Templates are read-only sources: clone them into a new tenant project before customization. Never edit a shared template in place.
- A path on an operator's Mac is an archive location, not a production-accessible template. Do not claim a Bloomie can use it until it appears in the approved template registry.

## 2. Route the deliverable

Match the requested deliverable, not a passing keyword:

- Presentation, pitch deck, or navigable deck: slideshow workflow.
- Plain captions on existing talking-head footage: embedded-captions workflow.
- Designed overlays on existing interview, podcast, or talking-head footage: talking-head-recut workflow.
- Beat-synced video driven by a music track: music-to-video workflow.
- Short unnarrated motion-first unit, logo sting, title, stat hit, chart, map, or lower third: motion-graphics workflow.
- Product, website, app, or company showcase from a URL: product-launch workflow.
- Topic explainer using invented visuals: faceless-explainer workflow.
- Any other custom video or composition: general-video workflow.

Record the selected workflow and decisions in `BRIEF.md` for multi-step work so future cycles resume rather than restart.

## 3. Authoring contract

1. Plan scenes, timing, and media before writing the composition.
2. A standalone project requires **`index.html` at the project root**. Never invent `composition.html` as the entry file.
3. The composition root must include `data-composition-id`, `data-start="0"`, `data-width`, `data-height`, and `data-duration`.
4. Include at least one timed element with `data-start`, `data-duration`, and `data-track-index`.
5. Register exactly one paused GSAP timeline at `window.__timelines["<composition-id>"]`. The key must match the root `data-composition-id`.
6. Timing must be deterministic and seekable. Use seconds, never milliseconds. Do not use infinite CSS or GSAP loops.
7. Let HyperFrames own media playback. Keep all required assets inside the tenant project; do not depend on symlinks or files outside it.
8. Use the requested native aspect ratio. Do not crop, pad, blur, or reframe media unless the user asked for that treatment.

## 4. Safe execution sequence

1. Use `hyperframes_list_projects` before assuming a project is new. Review both tenant projects and approved shared templates. When using an approved shared template, clone it with `hyperframes_clone_template` before changing anything.
2. Use `hyperframes_catalog` when a reusable official block or component may fit. Install only the selected item with `hyperframes_add`; do not bulk-install the catalog for ordinary projects.
3. Use `hyperframes_read_project` before editing existing work.
4. Use `hyperframes_write_project` with a tenant-isolated slug and complete file contents.
5. For a new project, run `hyperframes_run` with `init` only when scaffolding is actually needed.
6. Run `hyperframes_run` with `upgrade-check` before the first render-affecting command on a resumed project. If it reports an older pinned version, run `upgrade`, then `check`. If validation fails after upgrading, report the failure and do not render.
7. Run `check` and repair every validation error.
8. Run `snapshot` for visual review when the output is visual.
9. Run `render` only after validation passes and only when the user requested or approved generation. Always provide an `.mp4` output filename.
10. A successful render automatically saves the exact binary to the current Work session. Never invent a URL or save a URL string as if it were a video.

## 5. Completion contract

Do not claim success from a command starting or a render being pending. Wait for the tool result and report:

- tenant project slug;
- selected workflow;
- composition entry file and dimensions;
- validation result;
- snapshot result when used;
- exact MP4 artifact receipt/download information after rendering.

If a required tool fails, state the exact error and the safe next action. Do not substitute a generic video workflow or ask the user to do work the available tools can complete.
