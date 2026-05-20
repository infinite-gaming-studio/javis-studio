# Speed Control for Narration Workbench & Emotion Library

## Summary

Add `speed` (语速) parameter support to the Javis Studio narration workbench at two levels: global VoiceSettings and per custom emotion preset. When a custom emotion preset with a speed value is applied, it overrides the global speed. The `target_length_ms` parameter from the IndexTTS2 API is not exposed in the UI.

## Requirements

- Global speed control in VoiceSettings panel (0.5x - 2.0x, default 1.0x)
- Per custom emotion preset speed override (optional, falls back to global)
- Backward compatible: old data without `speed` field works unchanged (defaults to 1.0)
- Speed value passed through to IndexTTS2 `/api/tts` `speed` parameter

## Data Flow

```
Global VoiceSettings.speed (default 1.0)
  ↓ overridden by
CustomEmotion.speed (optional, undefined = follow global)
  ↓ passed to
Backend VoiceSettings.speed → IndexTTS2 API speed param
```

## Changes

### 1. Frontend: `api.ts` — Type Definitions

- `VoiceSettings`: add `speed?: number` (range 0.5-2.0, default 1.0)
- `CustomEmotion`: add `speed?: number` (optional, undefined = follow global)
- `DEFAULT_VOICE` in `page.tsx`: add `speed: 1.0`

### 2. Frontend: `VoiceSettings.tsx` — Global Panel

- Add speed slider below `use_random` toggle
- Range: 0.5 - 2.0, step 0.05
- Display: show current value with contextual label (e.g. "1.0x 正常", "1.3x 加速", "0.7x 减速")

### 3. Frontend: `EmotionLibrary.tsx` — Emotion Preset Editor

- Add speed slider below Alpha slider in the edit form
- Add "跟随全局" (follow global) checkbox/toggle — when checked, `speed` is `undefined`; when unchecked, slider is active
- In preset list items: show speed tag when set (e.g. "s=1.3")
- Import validation: `speed` defaults to `undefined` if missing from JSON (backward compat)

### 4. Frontend: `page.tsx` — Audio Generation Logic

- In `handleGenerateAudioForClip`: when custom emotion has `speed` defined, set `mergedSettings.speed = customEmo.speed`

### 5. Backend: `schemas.py` — VoiceSettings Model

- Add `speed: float = Field(1.0, ge=0.5, le=2.0, description="Speech speed ratio")`

### 6. Backend: `tts_service.py` — REST Synthesis

- In `synthesize_rest()`: pass `voice_settings.speed` to IndexTTS2 API `speed` parameter if not 1.0

## Backward Compatibility

- `VoiceSettings.speed` defaults to 1.0 — old clients that don't send this field get unchanged behavior
- `CustomEmotion.speed` is optional/undefined — old JSON without this field parsed as "follow global"
- Existing `AudioClip` type unchanged — no per-clip speed
- Backend `VoiceSettings` Pydantic model has default value — old API calls without `speed` still validate
