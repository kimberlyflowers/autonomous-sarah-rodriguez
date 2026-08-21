# Bloomie Watch design QA

- Source captured from production `/live` at desktop width before implementation.
- Existing Big Pivot artwork and Supabase video URLs are reused unchanged.
- TikTok shows require their original cover files in Supabase; the UI does not generate substitute cover art.
- Desktop verification: passed in Chrome at the normal desktop viewport; hero, rail, typography, spacing, and source media rendered correctly.
- Mobile verification: passed in Chrome at 390x844; hero copy, actions, portrait card, search, and footer remained usable without horizontal page overflow.
- Playback verification: passed; Watch opens the modal player with all six current Big Pivot episodes and real Supabase media.
- Hover-preview implementation: real preview videos replace covers on pointer hover or keyboard focus; TikTok cards remain hidden until their real covers and episode assets exist in Supabase.

final result: passed
