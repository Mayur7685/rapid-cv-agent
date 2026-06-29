import os
import sys
from PIL import Image

# Add app to path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.agents.vlm_helper import get_moondream_model

def main():
    print("==================================================")
    # Ensure sample image exists
    sample_img_path = "samples/sample_000.jpg"
    if not os.path.exists(sample_img_path):
        print(f"Error: {sample_img_path} not found.")
        return
        
    print(f"Loading sample image: {sample_img_path}")
    image = Image.open(sample_img_path)
    
    print("\n--- Step 1: Initialize local Moondream model ---")
    try:
        model = get_moondream_model()
    except Exception as e:
        print(f"Failed to load Moondream model: {e}")
        return

    print("\n--- Step 2: Test VQA Query ---")
    try:
        question = "What is in this image?"
        print(f"Querying VQA: '{question}'")
        res = model.query(image, question)
        print(f"VQA Answer: {res.get('answer', '')}")
    except Exception as e:
        print(f"VQA Query failed: {e}")

    print("\n--- Step 3: Test Object Detection ---")
    try:
        target_obj = "object"
        print(f"Detecting: '{target_obj}'")
        res = model.detect(image, target_obj)
        objects = res.get("objects", [])
        print(f"Detected {len(objects)} boxes.")
        for idx, obj in enumerate(objects):
            print(f"  Box {idx}: x_min={obj['x_min']:.3f}, y_min={obj['y_min']:.3f}, x_max={obj['x_max']:.3f}, y_max={obj['y_max']:.3f}")
    except Exception as e:
        print(f"Object detection failed: {e}")

    print("\n--- Step 4: Test Segmentation Mask ---")
    try:
        target_seg = "object"
        print(f"Segmenting: '{target_seg}'")
        res = model.segment(image, target_seg)
        path = res.get("path", "")
        print(f"Returned segmentation SVG path length: {len(path)} characters.")
        if path:
            print(f"Path snippet: {path[:60]}...")
    except ValueError as e:
        print(f"Segmentation skipped (Moondream model does not support segmentation templates): {e}")
    except Exception as e:
        print(f"Segmentation failed: {e}")

    print("\n==================================================")
    print("VLM Offline verification complete.")

if __name__ == "__main__":
    main()
