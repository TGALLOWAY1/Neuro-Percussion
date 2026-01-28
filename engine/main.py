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
from fastapi import Response
from engine.params.resolve import resolve_params
import base64

@app.post("/generate/kick")
async def generate_kick(params: dict):
    """
    Generates a kick drum.
    Returns JSON with base64-encoded audio and resolved_params.
    """
    # Extract seed if present (don't mutate original params)
    params_copy = params.copy()
    seed = params_copy.pop("seed", 0)
    
    # Resolve params (deep-merge with defaults)
    resolved = resolve_params("kick", params_copy)
    
    # Render audio with resolved params
    engine = KickEngine(sample_rate=48000)
    audio = engine.render(resolved, seed=seed)
    
    # Export to bytes
    wav_bytes = AudioIO.to_bytes(audio, 48000, format='WAV')
    
    # Return JSON with base64 audio and resolved params
    return {
        "audio": base64.b64encode(wav_bytes).decode("utf-8"),
        "resolved_params": resolved,
    }

from engine.instruments.snare import SnareEngine
from engine.instruments.hat import HatEngine

@app.post("/generate/snare")
async def generate_snare(params: dict):
    """
    Generates a snare drum.
    Returns JSON with base64-encoded audio and resolved_params.
    """
    params_copy = params.copy()
    seed = params_copy.pop("seed", 0)
    
    resolved = resolve_params("snare", params_copy)
    
    engine = SnareEngine(sample_rate=48000)
    audio = engine.render(resolved, seed=seed)
    wav_bytes = AudioIO.to_bytes(audio, 48000, format='WAV')
    
    return {
        "audio": base64.b64encode(wav_bytes).decode("utf-8"),
        "resolved_params": resolved,
    }

@app.post("/generate/hat")
async def generate_hat(params: dict):
    """
    Generates a hi-hat.
    Returns JSON with base64-encoded audio and resolved_params.
    """
    params_copy = params.copy()
    seed = params_copy.pop("seed", 0)
    
    resolved = resolve_params("hat", params_copy)
    
    engine = HatEngine(sample_rate=48000)
    audio = engine.render(resolved, seed=seed)
    wav_bytes = AudioIO.to_bytes(audio, 48000, format='WAV')
    
    return {
        "audio": base64.b64encode(wav_bytes).decode("utf-8"),
        "resolved_params": resolved,
    }


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
PARAM_SPACES = {
    'kick': {
        'punch_decay': (0.1, 1.0),
        'click_amount': (0.0, 1.0),
        'click_snap': (0.0, 1.0),
        'room_tone_freq': (50.0, 300.0),
        'room_air': (0.0, 1.0),
        'distance_ms': (0.0, 50.0),
        'blend': (0.0, 1.0)
    },
    'snare': {'tone': (0, 1), 'wire': (0, 1), 'crack': (0, 1), 'body': (0, 1)},
    'hat': {'tightness': (0, 1), 'sheen': (0, 1), 'dirt': (0, 1), 'color': (0, 1)}
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
