import numpy as np
import random
from typing import Dict, List
from engine.ml.model import PreferenceModel

class Sampler:
    def __init__(self, model: PreferenceModel):
        self.model = model
        self.epsilon = 0.3 # Exploration rate

    def propose(self, param_space: Dict[str, tuple], n_candidates: int = 50) -> Dict[str, float]:
        """
        Propose a new parameter set.
        param_space: dict of 'name': (min, max).
        """
        # Epsilon-Greedy
        if not self.model.fitted or random.random() < self.epsilon:
             return self._random_sample(param_space)
             
        # Generate candidates
        candidates = []
        scores = []
        
        for _ in range(n_candidates):
            cand = self._random_sample(param_space)
            score = self.model.predict_proba(cand)
            candidates.append(cand)
            scores.append(score)
            
        # Pick best
        best_idx = np.argmax(scores)
        return candidates[best_idx]

    def mutate(self, params: Dict[str, float], param_space: Dict[str, tuple], sigma: float = 0.1) -> Dict[str, float]:
        """
        Mutate existing params.
        """
        new_params = params.copy()
        for k, v in new_params.items():
            min_val, max_val = param_space[k]
            # Gaussian perturbation
            delta = random.gauss(0, sigma)
            new_val = np.clip(v + delta, min_val, max_val)
            new_params[k] = new_val
        return new_params

    def _random_sample(self, param_space: Dict[str, tuple]) -> Dict[str, float]:
        return {
            k: random.uniform(min_v, max_v) 
            for k, (min_v, max_v) in param_space.items()
        }
