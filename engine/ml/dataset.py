import json
import os
from typing import List, Dict, Any
from datetime import datetime

class DatasetStore:
    def __init__(self, filepath: str = "data/user_labels.jsonl"):
        self.filepath = filepath
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

    def add(self, instrument: str, params: Dict[str, float], features: Dict[str, float], label: int, seed: int):
        """
        Saves a labeled example. 
        Label: 1 (Like), 0 (Dislike).
        """
        entry = {
            "timestamp": datetime.now().isoformat(),
            "instrument": instrument,
            "params": params,
            "features": features,
            "label": label,
            "seed": seed,
            "schema_version": 1
        }
        
        with open(self.filepath, 'a') as f:
            f.write(json.dumps(entry) + "\n")

    def load(self, instrument: str = None) -> List[Dict[str, Any]]:
        """
        Loads dataset. Optional filter by instrument.
        """
        data = []
        if not os.path.exists(self.filepath):
            return data
            
        with open(self.filepath, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line)
                    if instrument and entry.get('instrument') != instrument:
                        continue
                    data.append(entry)
                except json.JSONDecodeError:
                    continue
        return data
