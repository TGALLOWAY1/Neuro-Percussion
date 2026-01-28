from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.exceptions import NotFittedError
from typing import List, Dict
import numpy as np

class PreferenceModel:
    def __init__(self):
        self.pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42))
        ])
        self.fitted = False
        self._feature_keys = None  # Store feature keys for consistent prediction

    def train(self, data: List[Dict]):
        """
        Trains model on a list of data entries.
        Expects entries to have 'params' and 'label'.
        Extracts only macro params (flat, numeric values) for consistent feature vectors.
        """
        if len(data) < 5:
            # Not enough data
            return 
            
        # Extract X (params) and y (label)
        # Extract only macro params (flat, numeric) to avoid nested dict issues
        # Macro params are top-level numeric values, not nested structures
        
        X = []
        y = []
        
        # Determine expected macro param keys from first entry
        # Macro params are flat numeric values (not dicts)
        expected_keys = None
        
        for entry in data:
            params = entry['params']
            
            # Extract only macro params (flat numeric values, not nested dicts)
            macro_params = {}
            for key, value in params.items():
                # Skip nested dicts (like "kick": {...}, "snare": {...})
                if isinstance(value, dict):
                    continue
                # Skip non-numeric values
                if not isinstance(value, (int, float)):
                    continue
                macro_params[key] = value
            
            # Set expected keys from first entry
            if expected_keys is None:
                expected_keys = sorted(macro_params.keys())
            
            # Build vector with consistent order, using 0.0 for missing keys
            vector = [macro_params.get(k, 0.0) for k in expected_keys]
            X.append(vector)
            y.append(entry['label'])
        
        # Only train if we have valid feature vectors
        if len(X) > 0 and len(X[0]) > 0:
            self.pipeline.fit(X, y)
            self.fitted = True
            self._feature_keys = expected_keys  # Store for prediction
        
    def predict_proba(self, params: Dict[str, float]) -> float:
        """
        Predicts probability of 'Like' (class 1).
        Extracts only macro params (flat numeric values) for consistent feature vectors.
        """
        if not self.fitted:
            return 0.5 # Uncertainty
        
        # Extract macro params (flat numeric values, not nested dicts)
        macro_params = {}
        for key, value in params.items():
            if isinstance(value, dict):
                continue
            if not isinstance(value, (int, float)):
                continue
            macro_params[key] = value
        
        # Use stored feature keys from training, or infer from params
        if hasattr(self, '_feature_keys') and self._feature_keys:
            feature_keys = self._feature_keys
        else:
            feature_keys = sorted(macro_params.keys())
        
        # Build vector with consistent order, using 0.0 for missing keys
        vector = [macro_params.get(k, 0.0) for k in feature_keys]
        
        try:
            # shape [1, n_features]
            probs = self.pipeline.predict_proba([vector])[0]
            # probs is [prob_0, prob_1]
            if len(probs) > 1:
                return probs[1]
            else:
                return probs[0] # Should typically be 2 classes if labels are mixed
        except (NotFittedError, ValueError, KeyError):
            return 0.5
