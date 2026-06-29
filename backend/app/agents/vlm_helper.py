"""
vlm_helper.py — Moondream 2 model loader

Loads and caches the local Moondream 2 VLM (Apple Silicon MPS / CUDA / CPU).
Used by both:
  - autolabel_agent.py  (batch zero-shot auto-labeling)
  - app/api/routes/vlm.py  (interactive per-image VLM queries from the UI)

The model is lazy-loaded on first call and kept in memory for the server lifetime.
"""

import torch

_moondream_model = None


def get_moondream_model():
    """
    Lazy-loads and caches the Moondream 2 VLM.
    Automatically picks the best device: MPS (Apple Silicon), CUDA, or CPU.
    """
    global _moondream_model
    if _moondream_model is not None:
        return _moondream_model

    print("\n==============================================================")
    print("Loading local Moondream 2 VLM...")
    print("==============================================================")

    # Detect best available device
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"
    print(f"  Device: {device}")

    try:
        import moondream as md
        # local=True downloads/uses local weights; model="moondream2" selects the v2 checkpoint
        _moondream_model = md.vl(local=True, model="moondream2")
        print("✔ Moondream 2 loaded successfully!")
    except Exception as e:
        print(f"✘ Failed to load moondream2 checkpoint: {e}")
        print("  Retrying with default local weights...")
        try:
            import moondream as md
            _moondream_model = md.vl(local=True)
            print("✔ Moondream (default) loaded successfully!")
        except Exception as inner_e:
            print(f"✘ Critical — cannot load Moondream: {inner_e}")
            raise RuntimeError(
                "Moondream VLM could not be loaded. "
                "Make sure 'moondream' is installed and weights are available: "
                "pip install moondream"
            ) from inner_e

    return _moondream_model
