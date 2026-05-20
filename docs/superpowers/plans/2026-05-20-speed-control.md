# Speed Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `speed` (语速) parameter to the narration workbench at global VoiceSettings and per custom emotion preset levels, with backward compatibility.

**Architecture:** Speed is added as an optional field to both `VoiceSettings` (default 1.0) and `CustomEmotion` (optional, undefined = follow global). When generating audio, custom emotion speed overrides global speed. Backend passes speed to IndexTTS2 API.

**Tech Stack:** Next.js (React/TypeScript) frontend, FastAPI (Python/Pydantic) backend, IndexTTS2 REST API

---

### Task 1: Backend — Add `speed` field to VoiceSettings Pydantic model

**Files:**
- Modify: `backend/models/schemas.py:14-37`

- [ ] **Step 1: Add `speed` field to `VoiceSettings` class**

In `backend/models/schemas.py`, add the `speed` field after `use_random`:

```python
    use_random: bool = Field(False, description="Enable stochastic inference (reduces voice fidelity)")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Speech speed ratio (0.5=slow, 1.0=normal, 2.0=fast)")
```

- [ ] **Step 2: Verify the model loads without error**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/backend && python -c "from models.schemas import VoiceSettings; vs = VoiceSettings(spk_audio_prompt='test'); print(f'speed={vs.speed}')"`

Expected: `speed=1.0`

- [ ] **Step 3: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat: add speed field to VoiceSettings Pydantic model"
```

---

### Task 2: Backend — Pass `speed` to IndexTTS2 REST API

**Files:**
- Modify: `backend/services/tts_service.py:139-159`

- [ ] **Step 1: Add speed parameter to `synthesize_rest()` form data**

In `backend/services/tts_service.py`, inside `synthesize_rest()`, after the existing optional parameters block (after the `max_text_tokens_per_segment` check at line ~159), add:

```python
    if voice_settings.speed != 1.0:
        data["speed"] = str(voice_settings.speed)
```

- [ ] **Step 2: Verify the change is syntactically correct**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/backend && python -c "from services.tts_service import synthesize_rest; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/services/tts_service.py
git commit -m "feat: pass speed parameter to IndexTTS2 REST API"
```

---

### Task 3: Frontend — Add `speed` to TypeScript types and default values

**Files:**
- Modify: `frontend/src/lib/api.ts:7-24` (VoiceSettings type)
- Modify: `frontend/src/lib/api.ts:68-75` (CustomEmotion type)
- Modify: `frontend/src/app/page.tsx:34-39` (DEFAULT_VOICE)

- [ ] **Step 1: Add `speed` to `VoiceSettings` interface in `api.ts`**

After `use_random: boolean;` (line 14), add:

```typescript
  speed?: number; // 0.5–2.0, default 1.0
```

- [ ] **Step 2: Add `speed` to `CustomEmotion` interface in `api.ts`**

After `text?: string;` (line 74), add:

```typescript
  speed?: number; // 0.5–2.0, undefined = follow global
```

- [ ] **Step 3: Add `speed` to `DEFAULT_VOICE` in `page.tsx`**

Change line 34-39 from:

```typescript
const DEFAULT_VOICE: VoiceSettings = {
  spk_audio_prompt: "",
  emotion_mode: "none",
  emo_alpha: 1.0,
  use_random: false,
};
```

to:

```typescript
const DEFAULT_VOICE: VoiceSettings = {
  spk_audio_prompt: "",
  emotion_mode: "none",
  emo_alpha: 1.0,
  use_random: false,
  speed: 1.0,
};
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors related to speed/VoiceSettings/CustomEmotion (there may be pre-existing unrelated errors)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/app/page.tsx
git commit -m "feat: add speed field to VoiceSettings and CustomEmotion types"
```

---

### Task 4: Frontend — Add speed slider to VoiceSettings panel

**Files:**
- Modify: `frontend/src/components/VoiceSettings.tsx:47-103`

- [ ] **Step 1: Add speed slider UI to VoiceSettings component**

In `frontend/src/components/VoiceSettings.tsx`, after the `use_random` toggle block (after line 101, before the closing `</div>`), add:

```tsx
      {/* Speed control */}
      <div className="py-1">
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">语速控制</label>
          <span className="text-xs font-bold text-cyan-600">
            {value.speed ?? 1.0}x{(value.speed ?? 1.0) === 1.0 ? " 正常" : (value.speed ?? 1.0) > 1.0 ? " 加速" : " 减速"}
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.05}
          value={value.speed ?? 1.0}
          onChange={(e) => update({ speed: parseFloat(e.target.value) })}
          className="w-full accent-cyan-500"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>0.5x 慢速</span>
          <span>1.0x 正常</span>
          <span>2.0x 快速</span>
        </div>
      </div>
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors related to VoiceSettings

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/VoiceSettings.tsx
git commit -m "feat: add speed slider to VoiceSettings panel"
```

---

### Task 5: Frontend — Add speed control to EmotionLibrary editor

**Files:**
- Modify: `frontend/src/components/EmotionLibrary.tsx`

- [ ] **Step 1: Update `DEFAULT_EMOTION` to include speed**

Change line 12-19 from:

```typescript
const DEFAULT_EMOTION: CustomEmotion = {
  id: "",
  name: "新情感预设",
  mode: "text",
  alpha: 1.0,
  text: "",
  vector: [0, 0, 0, 0, 0, 0, 0, 0],
};
```

to:

```typescript
const DEFAULT_EMOTION: CustomEmotion = {
  id: "",
  name: "新情感预设",
  mode: "text",
  alpha: 1.0,
  text: "",
  vector: [0, 0, 0, 0, 0, 0, 0, 0],
  speed: undefined,
};
```

- [ ] **Step 2: Add speed slider + follow-global toggle to the edit form**

In the edit form (after the Alpha slider section, after line 447 `</div>`, before `{editForm.mode === "text" && (`), add:

```tsx
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">语速控制</label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.speed === undefined}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          speed: e.target.checked ? undefined : 1.0
                        })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 accent-indigo-500"
                      />
                      <span className="text-[11px] font-semibold text-slate-500">跟随全局</span>
                    </label>
                  </div>
                  {editForm.speed !== undefined ? (
                    <>
                      <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                        <span></span>
                        <span className="text-indigo-500">{editForm.speed.toFixed(2)}x{editForm.speed === 1.0 ? " 正常" : editForm.speed > 1.0 ? " 加速" : " 减速"}</span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={2.0}
                        step={0.05}
                        value={editForm.speed}
                        onChange={(e) => setEditForm({...editForm, speed: parseFloat(e.target.value)})}
                        className="w-full accent-indigo-500"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>0.5x 慢速</span>
                        <span>1.0x 正常</span>
                        <span>2.0x 快速</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-400">使用全局语速设置</p>
                  )}
                </div>
```

- [ ] **Step 3: Show speed tag in preset list items**

In the preset list item (around line 353-357 where tags are displayed), change:

```tsx
                        <div className="flex gap-2 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase font-mono tracking-tighter">
                            {emo.mode}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100/50 text-indigo-500 rounded uppercase font-mono tracking-tighter">
                            a={emo.alpha.toFixed(2)}
                          </span>
                        </div>
```

to:

```tsx
                        <div className="flex gap-2 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase font-mono tracking-tighter">
                            {emo.mode}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100/50 text-indigo-500 rounded uppercase font-mono tracking-tighter">
                            a={emo.alpha.toFixed(2)}
                          </span>
                          {emo.speed !== undefined && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100/50 text-cyan-500 rounded uppercase font-mono tracking-tighter">
                              s={emo.speed.toFixed(2)}
                            </span>
                          )}
                        </div>
```

- [ ] **Step 4: Update import validation to handle speed**

In `handleImport` (around line 125-132), change the validated mapping from:

```typescript
        const validated: CustomEmotion[] = parsed.map((item: any) => ({
          id: item.id || Date.now().toString(36) + Math.random().toString(36).substring(2),
          name: item.name || "未命名",
          mode: item.mode || "text",
          alpha: typeof item.alpha === 'number' ? item.alpha : 1.0,
          text: item.text || "",
          vector: Array.isArray(item.vector) && item.vector.length === 8 ? item.vector : [0,0,0,0,0,0,0,0],
        }));
```

to:

```typescript
        const validated: CustomEmotion[] = parsed.map((item: any) => ({
          id: item.id || Date.now().toString(36) + Math.random().toString(36).substring(2),
          name: item.name || "未命名",
          mode: item.mode || "text",
          alpha: typeof item.alpha === 'number' ? item.alpha : 1.0,
          text: item.text || "",
          vector: Array.isArray(item.vector) && item.vector.length === 8 ? item.vector : [0,0,0,0,0,0,0,0],
          speed: typeof item.speed === 'number' ? item.speed : undefined,
        }));
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors related to EmotionLibrary/CustomEmotion/speed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/EmotionLibrary.tsx
git commit -m "feat: add speed control to EmotionLibrary editor with follow-global toggle"
```

---

### Task 6: Frontend — Apply custom emotion speed override in audio generation

**Files:**
- Modify: `frontend/src/app/page.tsx:390-436`

- [ ] **Step 1: Add speed override logic in `handleGenerateAudioForClip`**

In `page.tsx`, inside `handleGenerateAudioForClip`, after the custom emotion block where `emo_text` is set (around line 408, after `mergedSettings.emo_text = customEmo.text;`), add:

```typescript
        if (customEmo.speed !== undefined) {
          mergedSettings.speed = customEmo.speed;
        }
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: apply custom emotion speed override in audio generation"
```

---

### Task 7: Integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run frontend TypeScript check**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/frontend && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors related to speed, VoiceSettings, CustomEmotion, EmotionLibrary, or VoiceSettingsPanel

- [ ] **Step 2: Run backend import check**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/backend && python -c "from models.schemas import VoiceSettings; from services.tts_service import synthesize_rest; vs = VoiceSettings(spk_audio_prompt='test', speed=1.3); print(f'VoiceSettings speed={vs.speed}')"`

Expected: `VoiceSettings speed=1.3`

- [ ] **Step 3: Verify backward compatibility — backend with no speed**

Run: `cd /Users/nvozi/Coding/ai-based-projects/javis-studio/backend && python -c "from models.schemas import VoiceSettings; vs = VoiceSettings(spk_audio_prompt='test'); print(f'default speed={vs.speed}')"`

Expected: `default speed=1.0`

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve integration issues from speed control feature"
```
