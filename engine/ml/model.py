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

    def train(self, data: List[Dict]):
        """
        Trains model on a list of data entries.
        Expects entries to have 'params' and 'label'.
        """
        if len(data) < 5:
            # Not enough data
            return 
            
        # Extract X (params) and y (label)
        # Note: We assume all entries have same param keys. 
        # For simplicity, we convert params dict to sorted list of values.
        
        X = []
        y = []
        
        for entry in data:
            # Sort keys to ensure order
            params = entry['params']
            vector = [params[k] for k in sorted(params.keys())]
            X.append(vector)
            y.append(entry['label'])
            
        self.pipeline.fit(X, y)
        self.fitted = True
        
    def predict_proba(self, params: Dict[str, float]) -> float:
        """
        Predicts probability of 'Like' (class 1).
        """
        if not self.fitted:
            return 0.5 # Uncertainty
            
        vector = [params[k] for k in sorted(params.keys())]
        try:
            # shape [1, n_features]
            probs = self.pipeline.predict_proba([vector])[0]
            # probs is [prob_0, prob_1]
            if len(probs) > 1:
                return probs[1]
            else:
                return probs[0] # Should typically be 2 classes if labels are mixed
        except NotFittedError:
            return 0.5
