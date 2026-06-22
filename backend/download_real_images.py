import os
import urllib.request

URLS = {
    "bottle_1.jpg": "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=640",
    "cup_2.jpg": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=640",
    "bottle_2.jpg": "https://images.unsplash.com/photo-1523362628745-0c100150b504?w=640",
    "cup_3.jpg": "https://images.unsplash.com/photo-1577937927133-66ef06acdf18?w=640",
    "cup_4.jpg": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=640",
    "bottle_3.jpg": "https://images.unsplash.com/photo-1563206767-5b18f218e8de?w=640",
    "bottle_4.jpg": "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=640"
}

def download_images(output_dir="real_samples"):
    os.makedirs(output_dir, exist_ok=True)
    print(f"Downloading real images to '{output_dir}' directory...")
    
    for filename, url in URLS.items():
        dest_path = os.path.join(output_dir, filename)
        if os.path.exists(dest_path):
            print(f"File {filename} already exists, skipping.")
            continue
            
        try:
            print(f"Downloading {filename} from Unsplash...")
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
            )
            with urllib.request.urlopen(req) as response:
                with open(dest_path, 'wb') as out_file:
                    out_file.write(response.read())
            print(f"Successfully downloaded {filename}.")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")

if __name__ == "__main__":
    download_images()
