import os
from PIL import Image as PILImage, ImageDraw

def create_sample_images(output_dir="samples", num_images=10):
    os.makedirs(output_dir, exist_ok=True)
    print(f"Generating {num_images} dummy sample images in '{output_dir}'...")
    
    for i in range(num_images):
        # Create a new RGB image
        img = PILImage.new("RGB", (640, 480), color=(i * 25 % 256, i * 50 % 256, i * 75 % 256))
        draw = ImageDraw.Draw(img)
        
        # Draw some rectangles to simulate bounding boxes of objects
        if i % 2 == 0:
            # Draw a simulated helmet shape (yellow box)
            draw.rectangle([50, 100, 200, 250], fill=(255, 255, 0), outline=(255, 0, 0), width=3)
        if i % 3 == 0:
            # Draw a simulated vest shape (orange box)
            draw.rectangle([250, 150, 450, 400], fill=(255, 128, 0), outline=(255, 0, 0), width=3)
            
        img.save(os.path.join(output_dir, f"sample_{i:03d}.jpg"))
        
    print("Sample images generated successfully.")

if __name__ == "__main__":
    create_sample_images()
