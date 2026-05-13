---
name: elevenlabs-audio
description: "Create or revise natural ElevenLabs voiceover audio, TTS scripts, ad narration, spoken scripts, voice settings, and audio files. Always check official ElevenLabs docs before generating audio because pause and emotion markup depends on the model."
---

# ElevenLabs Audio — Natural Voiceover Generation

Use this skill for Bloomie/Bloomie Staffing voiceovers, ad reads, narration, and any ElevenLabs text-to-speech generation.

## Mandatory Docs Gate

Before generating or regenerating audio, check the current official ElevenLabs docs for:
- target model supported markup
- pause handling
- emotion/audio tags
- API fields and voice settings
- model-specific best practices

Do not assume old SSML guidance applies. Different ElevenLabs models handle pauses and emotion tags differently.

## Default Generation Pattern

For natural ad narration, default to:
- `model_id`: `eleven_v3` unless docs or user requirements indicate another model
- delivery target: warm conversationalist, sincere, confident, emotionally aware, not theatrical
- voice settings starting point:
  - `stability`: around `0.45`
  - `similarity_boost`: around `0.85`
  - `style`: around `0.30-0.40`
  - `use_speaker_boost`: `true`
  - `speed`: around `0.95` for thoughtful narration
- use a fixed `seed` when a repeatable take is desired
- output format: `mp3_44100_128` unless another format is requested

Save both the generated audio file and the cleaned ElevenLabs-ready script.

## Approved Bloomie Voices

Use these saved voices for character consistency unless Kimberly explicitly asks to audition or replace the voice.

- **Sarah Rodriguez**
  - `voice_id`: `TOhxx937tpk5BU3jtXir`
  - delivery: warm conversationalist, sincere, emotionally aware, calm but persuasive
  - default model/settings: `eleven_v3`, `stability: 0.45`, `similarity_boost: 0.85`, `style: 0.32-0.40`, `use_speaker_boost: true`, `speed: 0.95`
- **Marcus Chen**
  - approved voice: Chris - Charming, Down-to-Earth
  - `voice_id`: `iP95p4xoKVk53GoZ742B`
  - delivery: grounded, natural, warm, trustworthy, advisor-like, not announcer-y
  - default model/settings: `eleven_v3`, `stability: 0.45`, `similarity_boost: 0.85`, `style: 0.32`, `use_speaker_boost: true`, `speed: 0.95`
  - approved audition file: `/Users/kimberlyflowersmini2/Documents/Codex/2026-05-08/ok-the-omibrandkit-github-website-needs/generated-audio/marcus-voice-auditions/marcus-audition-chris.mp3`

## Script Cleanup Rules

Transform rough stage directions into ElevenLabs-friendly delivery cues. Preserve the intent, not necessarily the literal tags.

Use sparingly:
- `[softly]`
- `[sincere]`
- `[warmly]`
- `[confident]`
- `[pause]`
- `[short pause]`

Avoid stacking too many tags. Too many tags can make the read feel performed instead of conversational.

Prefer line breaks between complete thoughts, ellipses for thoughtful hesitation, commas for connected phrasing, and short sentences for emotional landing points.

Do not let bracket notes become the script. If a tag risks being read literally or over-controlling the take, remove it and use punctuation or line breaks instead.

## Pause Handling

Pauses should support meaning, not interrupt grammar.

Good pause locations:
- after a complete sentence
- before a major turn in the argument
- before a CTA
- after a short emotional line, such as "The list got worked."

Avoid pauses or line breaks inside dependent phrases. This can make ElevenLabs inflect upward or falsely end the thought.

Problem pattern:
`top listing agents use to turn expireds...`

Do not line-break after `use`, because the voice may treat `use` like the end of a sentence.

Better:
`They come trained on the objection frameworks and prospecting scripts that top listing agents use to turn expireds and F.S.B.O.s into real conversations before they ever touch your pipeline.`

If the sentence is too long, rewrite it:
`Before your Bloomie ever touches your pipeline, they are trained on the objection frameworks and prospecting scripts top listing agents use to turn expireds and F.S.B.O.s into real conversations.`

## Pronunciation and Acronyms

If an acronym needs careful pronunciation, spell it phonetically with periods:
- `F.S.B.O.`
- `C.R.M.`

Use this only when needed. Too much punctuation can sound unnatural.

## Bloomie Ad Read Style

For Bloomie Staffing audio:
- make it sound like one human talking to one business owner
- write from inside the audience's world
- use concrete scenes before product claims
- let emotional lines breathe
- keep the CTA calm, direct, and low-pressure
- avoid generic phrases like "in today's competitive landscape"
- avoid sounding like a hype commercial

The ideal read feels warm, conversational, and quietly persuasive.

## Final QA

After generating audio:
- provide the audio path
- provide the cleaned script path
- mention that official docs were checked
- if the user reports an inflection problem, fix the script at the grammar/punctuation level first, then regenerate
