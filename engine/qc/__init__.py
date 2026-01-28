"""
Quality Control module for evaluating rendered one-shots.
"""
from engine.qc.qc import analyze
from engine.qc.thresholds import QC_THRESHOLDS

__all__ = ["analyze", "QC_THRESHOLDS"]
