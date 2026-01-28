"""
Default QC thresholds per instrument.
"""
QC_THRESHOLDS = {
    "kick": {
        "peak_dbfs_min": -1.0,
        "peak_dbfs_max": -0.1,
        "sub_ratio_min": 0.2,  # Minimum sub energy (20-100Hz)
        "click_ratio_min": 0.01,  # Minimum click energy (2k-8kHz)
        "aliasing_proxy_max": 0.5,  # Max aliasing proxy
    },
    "snare": {
        "peak_dbfs_min": -1.0,
        "peak_dbfs_max": -0.1,
        "body_ratio_min": 0.01,  # Minimum body energy (150-250Hz)
        "boxiness_ratio_max": 0.15,  # Max boxiness (300-600Hz)
        "crack_ratio_min": 0.01,  # Minimum crack energy (5k-8kHz)
        "aliasing_proxy_max": 0.5,  # Max aliasing proxy
        "ringing_proxy_max": 0.3,  # Max ringing proxy
    },
    "hat": {
        "peak_dbfs_min": -1.0,
        "peak_dbfs_max": -0.1,
        "energy_below_3k_max_pct": 10.0,  # Max % energy below 3kHz
        "aliasing_proxy_max": 0.5,  # Max aliasing proxy
    },
}
