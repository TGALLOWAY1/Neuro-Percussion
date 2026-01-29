from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("neuro-percussion")

app = FastAPI(
    title="Neuro-Percussion Engine",
    version="1.0.0",
    description="Procedural Audio Generation Engine"
)

# CORS (Allow Frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow any local port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "neuro-percussion-engine"}

from engine.instruments.kick import KickEngine
from engine.core.io import AudioIO
from fastapi import Response, Query, Body
from engine.params.resolve import resolve_params
from engine.params.clamp import clamp_params
from engine.params.engine_params import to_engine_params

@app.post("/generate/kick")
async def generate_kick(
    params: dict = Body(default={}, description="Engine params (nested kick.*, seed, etc.)"),
    mode: str = Query("default", description="Generation mode: 'default' or 'realistic'")
):
    """
    Generates a kick drum.
    Returns WAV audio bytes (binary).
    
    Query params:
    - mode: 'default' (no clamping) or 'realistic' (applies clamps to avoid harsh sounds)
    """
    # Single entry point: only engine params reach instruments (strip legacy)
    params_copy = to_engine_params(params.copy(), "kick")
    seed = params_copy.pop("seed", 0)
    
    # Apply realistic mode clamps if requested
    if mode == "realistic":
        params_copy = clamp_params("kick", params_copy)
    
    # Resolve params (deep-merge with defaults)
    resolved = resolve_params("kick", params_copy)
    
    # Render audio with resolved params
    engine = KickEngine(sample_rate=48000)
    audio = engine.render(resolved, seed=seed)
    
    # Export to bytes
    wav_bytes = AudioIO.to_bytes(audio, 48000, format='WAV')
    
    # Return WAV bytes directly (frontend expects blob)
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "attachment; filename=kick.wav"
        }
    )

from engine.instruments.snare import SnareEngine
from engine.instruments.hat import HatEngine

@app.post("/generate/snare")
async def generate_snare(
    params: dict = Body(default={}, description="Engine params (nested snare.*, seed, etc.)"),
    mode: str = Query("default", description="Generation mode: 'default' or 'realistic'")
):
    """
    Generates a snare drum.
    Returns WAV audio bytes (binary).
    
    Query params:
    - mode: 'default' (no clamping) or 'realistic' (applies clamps to avoid harsh sounds)
    """
    # Single entry point: only engine params reach instruments (strip legacy)
    params_copy = to_engine_params(params.copy(), "snare")
    seed = params_copy.pop("seed", 0)
    
    # Apply realistic mode clamps if requested
    if mode == "realistic":
        params_copy = clamp_params("snare", params_copy)
    
    resolved = resolve_params("snare", params_copy)
    
    engine = SnareEngine(sample_rate=48000)
    audio = engine.render(resolved, seed=seed)
    wav_bytes = AudioIO.to_bytes(audio, 48000, format='WAV')
    
    # Return WAV bytes directly (frontend expects blob)
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "attachment; filename=snare.wav"
        }
    )

@app.post("/generate/hat")
async def generate_hat(
    params: dict = Body(default={}, description="Engine params (nested hat.*, seed, etc.)"),
    mode: str = Query("default", description="Generation mode: 'default' or 'realistic'")
):
    """
    Generates a hi-hat.
    Returns WAV audio bytes (binary).
    
    Query params:
    - mode: 'default' (no clamping) or 'realistic' (applies clamps to avoid harsh sounds)
    """
    # Single entry point: only engine params reach instruments (strip legacy)
    params_copy = to_engine_params(params.copy(), "hat")
    seed = params_copy.pop("seed", 0)
    
    # Apply realistic mode clamps if requested
    if mode == "realistic":
        params_copy = clamp_params("hat", params_copy)
    
    resolved = resolve_params("hat", params_copy)
    
    engine = HatEngine(sample_rate=48000)
    audio = engine.render(resolved, seed=seed)
    wav_bytes = AudioIO.to_bytes(audio, 48000, format='WAV')
    
    # Return WAV bytes directly (frontend expects blob)
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "attachment; filename=hat.wav"
        }
    )


# --- ML Globals ---
from engine.ml.dataset import DatasetStore
from engine.ml.model import PreferenceModel
from engine.ml.sampler import Sampler

# One dataset/model per instrument or shared? PRD says "per-instrument preference models".
# We'll use a dictionary.
datasets = {
    'kick': DatasetStore('data/dateset_kick.jsonl'),
    'snare': DatasetStore('data/dataset_snare.jsonl'),
    'hat': DatasetStore('data/dataset_hat.jsonl')
}

models = {
    'kick': PreferenceModel(),
    'snare': PreferenceModel(),
    'hat': PreferenceModel()
}

# Pre-load data and train
for inst in models.keys():
    data = datasets[inst].load(inst)
    if data:
        models[inst].train(data)
        print(f"[{inst}] Model trained on {len(data)} examples.")

samplers = {
    'kick': Sampler(models['kick']),
    'snare': Sampler(models['snare']),
    'hat': Sampler(models['hat'])
}

# Param Spaces (macro controls only; used by proposer/mutator).
# Advanced params (per-layer gain_db/mute, ADSR, etc.) are manual/UI-only for now
# and are not in PARAM_SPACES to avoid exploding the search space.
# Ranges tightened to avoid harsh synthetic regions.
# Mix-ready targets:
#   - Snare: box cut 300-600Hz should be reduced (avoid extreme tone/crack/wire)
#   - Hat: should have little energy below 3kHz (avoid excessive dirt/FM)
PARAM_SPACES = {
    'kick': {
        'punch_decay': (0.15, 0.9),      # Tightened: avoid too short/long extremes
        'click_amount': (0.0, 0.85),     # Tightened: high click can be harsh
        'click_snap': (0.0, 0.85),       # Tightened: extreme snap sounds synthetic
        'room_tone_freq': (80.0, 250.0), # Tightened: avoid very low/high room tones
        'room_air': (0.0, 0.8),         # Tightened: high air can be too noisy
        'distance_ms': (5.0, 40.0),     # Tightened: avoid 0ms (no delay) and very long
        'blend': (0.1, 0.7)              # Tightened: avoid 0 (no room) and too much room
    },
    'snare': {
        # Tightened to avoid extreme boxiness (300-600Hz) and harshness
        'tone': (0.3, 0.8),              # Tightened: extreme frequencies cause boxiness
        'wire': (0.1, 0.75),             # Tightened: high wire can be harsh/metallic
        'crack': (0.1, 0.7),              # Tightened: high crack causes harsh transients
        'body': (0.2, 0.85)              # Tightened: avoid extreme body (affects boxiness)
    },
    'hat': {
        # Tightened to avoid brittle/harsh sounds; mix-ready: minimal energy below 3kHz
        'tightness': (0.1, 0.95),        # Keep reasonable range
        'sheen': (0.0, 0.7),              # Tightened: high sheen can be harsh
        'dirt': (0.0, 0.5),               # Tightened: high dirt/FM causes brittleness
        'color': (0.2, 0.85)              # Tightened: avoid extreme color shifts
    }
}

@app.post("/feedback")
async def feedback(data: dict):
    """
    Receives feedback: { instrument, params, seed, label: 0/1 }
    """
    inst = data.get('instrument')
    if inst not in datasets:
        return {"status": "error", "message": "Invalid instrument"}
        
    # Save
    # We should extract features first?
    # Ideally yes, but for now we just save params/label for V1 model training. 
    # The FeatureExtractor is redundant for this simple model unless we change Model to use Audio Features.
    # PRD 6.1 says "features": { "centroid": 1200... } in JSON schema.
    # So we should render (which is expensive) or just store 0s for now?
    # Let's simple-store for now to avoid re-rendering.
    
    datasets[inst].add(inst, data['params'], {}, data['label'], data['seed'])
    
    # Retrain (simple online update simulation)
    # In production handled by background task.
    all_data = datasets[inst].load(inst)
    models[inst].train(all_data)
    
    return {"status": "ok", "samples": len(all_data)}

@app.get("/propose/{instrument}")
async def propose(instrument: str):
    if instrument not in samplers:
        return {"status": "error"}
    
    params = samplers[instrument].propose(PARAM_SPACES[instrument])
    return params

from engine.export.exporter import Exporter
from engine.params.schema import PARAM_SCHEMA
from engine.params.resolve import resolve_params
from engine.params.canonical_defaults import ENGINE_DEFAULTS

@app.get("/schema/{instrument}")
async def get_schema(instrument: str):
    """
    Returns parameter schema for the specified instrument.
    Includes macro params, macros (Kick2-style), layer gains, ADSR, and advanced params.
    """
    if instrument not in PARAM_SCHEMA:
        return {"status": "error", "message": f"Invalid instrument: {instrument}"}
    
    return {
        "instrument": instrument,
        "schema": PARAM_SCHEMA[instrument]
    }

@app.get("/defaults/{instrument}")
async def get_defaults(instrument: str):
    """
    Returns default params for the specified instrument.
    Single source: ENGINE_DEFAULTS (canonical_defaults) + apply_macros, same as resolve_params(inst, {}).
    """
    if instrument not in ENGINE_DEFAULTS:
        return {"status": "error", "message": f"Invalid instrument: {instrument}"}
    defaults = resolve_params(instrument, {})
    return {
        "instrument": instrument,
        "defaults": defaults,
    }

@app.post("/export/kit")
async def export_kit(kit_data: dict):
    """
    Generates a ZIP file for the kit.
    """
    zip_bytes = Exporter.create_kit_zip(kit_data)
    return Response(
        content=zip_bytes, 
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=neuro_kit.zip"}
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
