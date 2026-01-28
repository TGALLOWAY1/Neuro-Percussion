# Envelope Controls Inventory

## Current Parameter Model

### Frontend (`frontend/src/components/AuditionView.tsx`)

**Current Macro Parameters:**
- **Kick:** `punch_decay`, `click_amount`, `click_snap`, `room_tone_freq`, `room_air`, `distance_ms`, `blend`
- **Snare:** `tone`, `wire`, `crack`, `body`
- **Hat:** `tightness`, `sheen`, `dirt`, `color`

**Storage:**
- Parameters stored in React state: `const [params, setParams] = useState<Record<string, number>>(DEFAULT_PARAMS['kick'])`
- Default values defined in `DEFAULT_PARAMS` constant (lines 37-49)
- Config metadata in `CONFIG` constant (lines 13-35) with `id`, `label`, `min`, `max`

**UI Rendering:**
- `MacroSlider` component (`frontend/src/components/MacroSlider.tsx`) renders sliders
- Grid layout: `grid grid-cols-2 gap-x-8 gap-y-6` (line 276)
- Sliders positioned below waveform viewer (line 231)

**Audio Generation Trigger:**
- `handleGenerate()` function (lines 73-95) calls `generateAudio()` from `@/lib/api`
- API call: `POST /generate/{instrument}` with params + seed in body
- No real-time preview on slider change; requires manual "Generate New" or "Replay"

### Backend (`engine/main.py`)

**API Endpoints:**
- `POST /generate/kick` (line 35)
- `POST /generate/snare` (line 77)
- `POST /generate/hat` (line 102)

**Parameter Flow:**
1. Receives `params: dict` from frontend
2. Extracts `seed` from params
3. Optionally applies `clamp_params()` if `mode=realistic`
4. Calls `resolve_params(instrument, params)` to merge with `DEFAULT_PRESET`
5. Passes resolved params to `engine.render(resolved, seed=seed)`
6. Returns WAV bytes via `AudioIO.to_bytes()`

**Parameter Resolution:**
- `engine/params/resolve.py` handles deep-merge of user params with defaults
- `engine/params/schema.py` defines `PARAM_SCHEMA` and `DEFAULT_PRESET`
- Backend supports nested params (e.g., `kick.click.gain_db`, `kick.sub.amp.decay_ms`)

### Engine Consumption

**Kick Engine (`engine/instruments/kick.py`):**
- Reads params via `get_param()` helper (from `engine/core/params.py`)
- Supports nested keys: `kick.sub.amp.decay_ms`, `kick.click.gain_db`, etc.
- Uses `LayerMixer` for per-layer gain/mute
- Uses `PostChain` for final processing

**Snare Engine (`engine/instruments/snare.py`):**
- Similar structure: nested params, `LayerMixer`, `PostChain`
- Layers: `exciter_body`, `exciter_air`, `shell`, `wires`, `room`

**Hat Engine (`engine/instruments/hat.py`):**
- Layers: `metal`, `air`, `chick`
- Similar param structure

## Current Limitations

1. **No visible envelope controls:** ADSR parameters exist in backend but are not exposed in UI
2. **No units displayed:** Sliders show normalized 0.0-1.0 values without context
3. **No real-time preview:** Slider changes don't trigger audio regeneration
4. **No envelope grouping:** All params shown as flat list, no AMP/PITCH/CLICK tabs
5. **No visual envelope graph:** No graphical representation of envelope shape

## Files to Modify/Create

### Frontend
- `frontend/src/components/AuditionView.tsx` - Add envelope strip below waveform
- `frontend/src/components/envelopes/EnvelopeStrip.tsx` - New component
- `frontend/src/components/envelopes/EnvelopePanel.tsx` - New component
- `frontend/src/components/envelopes/EnvelopeGraph.tsx` - New component
- `frontend/src/components/params/ParamSlider.tsx` - Enhanced slider with units
- `frontend/src/components/params/ParamToggle.tsx` - New toggle component
- `frontend/src/audio/params/types.ts` - Parameter spec types
- `frontend/src/audio/params/ranges.ts` - Parameter ranges/validation
- `frontend/src/audio/params/spec_kick.ts` - Kick envelope specs
- `frontend/src/audio/params/spec_snare.ts` - Snare envelope specs
- `frontend/src/audio/params/spec_hat.ts` - Hat envelope specs
- `frontend/src/audio/mapping/mapKickParams.ts` - Kick param mapping
- `frontend/src/audio/mapping/mapSnareParams.ts` - Snare param mapping
- `frontend/src/audio/mapping/mapHatParams.ts` - Hat param mapping

### Backend
- No changes required (already supports nested params)
