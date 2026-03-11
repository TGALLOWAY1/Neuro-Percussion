# Parameter Contract: CanonicalPatch + EngineParams

## Overview

The app uses a **single parameter contract** so that:

1. **CanonicalPatch** is the only schema used in the UI/store after hydration.
2. **EngineParams** is the only object that reaches the API and instrument DSP.
3. There is **exactly one mapping path**: `patchLike → hydratePatchToCanonical → CanonicalPatch → mapCanonicalToEngineParams → EngineParams`.

## Types

- **CanonicalPatch** (`frontend/src/audio/contract/types.ts`): `schemaVersion: 1`, `instrument`, `params` (macros only, no legacy keys), `envelopeParams`, `seed`, `repeatMode`, `roomEnabled`.
- **EngineParams**: `{ seed: number; [key: string]: unknown }` — the payload sent to `POST /generate/{instrument}`.

## Entry Points

| Function | Location | Role |
|----------|----------|------|
| `hydratePatchToCanonical(patchLike, instrument)` | `frontend/src/audio/contract/hydrate.ts` | Normalizes any patch-like object to CanonicalPatch; strips legacy param keys. |
| `mapCanonicalToEngineParams(canonical)` | `frontend/src/audio/contract/mapToEngine.ts` | Maps CanonicalPatch → EngineParams (single path to API). |
| `to_engine_params(raw, instrument)` | `engine/params/engine_params.py` | Backend: strips legacy keys from request body before resolve_params. |

## Legacy Fields

The following keys are **never** allowed in canonical params or engine params:

- `delayMix`, `delayFeedback`, `roomMix`, `earlyReflections`, `predelay`

- **Frontend**: `hydratePatchToCanonical` strips them from `params`. `mapCanonicalToEngineParams` calls `assertNoLegacyParams(merged)` — in dev mode this throws if any legacy key is present.
- **Backend**: `to_engine_params()` strips these keys before passing to `resolve_params()`.

## Flow

1. **UI** (e.g. AuditionView): Builds a patch-like from current state (params, envelopeParams, seed, kit slot).
2. **hydratePatchToCanonical(patchLike, instrument)** → CanonicalPatch (legacy stripped).
3. **mapCanonicalToEngineParams(canonical)** → EngineParams (only path to API).
4. **generateAudio(instrument, engineParams, seed)** sends engineParams in the request body.
5. **Backend** `POST /generate/{instrument}`: `to_engine_params(body, instrument)` → then `resolve_params()` → then `engine.render(resolved, seed)`.

No instrument receives raw patch objects; they receive only resolved params that have passed through `to_engine_params`.

## Tests

- `frontend/src/audio/contract/__tests__/hydrate.test.ts`: Hydration shape and legacy stripping.
- `frontend/src/audio/contract/__tests__/mapToEngine.test.ts`: Mapping shape and no legacy in output.
- `frontend/src/audio/contract/__tests__/legacyGuardrail.test.ts`: Legacy must not be applied post-migration; canonical from hydration has no legacy; passing a canonical with legacy to mapping throws in dev.

Run: `npm run test` (or `npx vitest run`).
