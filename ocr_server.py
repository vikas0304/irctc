import re
import base64
import io
import time
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

try:
    import pytesseract
    # Common Windows path for Tesseract. Update this if you installed it elsewhere!
    import os
    if os.name == 'nt':
        tess_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if os.path.exists(tess_path):
            pytesseract.pytesseract.tesseract_cmd = tess_path
        else:
            print(f"!!! WARNING: Tesseract not found at {tess_path}")
            print("!!! Please download and install Tesseract from: https://github.com/UB-Mannheim/tesseract/wiki")
except ImportError:
    print("Warning: pytesseract not installed. Will return dummy OCR for testing.")

app = Flask(__name__)
# Enable CORS so the Chrome Extension can talk to it seamlessly!
CORS(app)

@app.route('/solve', methods=['POST'])
def solve_captcha():
    data = request.json
    if not data or 'image' not in data:
        return jsonify({"error": "No base64 image provided"}), 400

    base64_img = data['image']
    
    # Strip the data metadata if provided directly from a canvas toDataURL
    if "," in base64_img:
        base64_img = base64_img.split(",")[1]

    try:
        # Decode the image
        img_data = base64.b64decode(base64_img)
        image = Image.open(io.BytesIO(img_data)).convert('L') # Convert to grayscale initially
        
        # NOTE: For aggressive IRCTC captchas, you will likely need to inject OpenCV noise removal rules here
        
        try:
            # Execute typical OCR
            text = pytesseract.image_to_string(image, config='--psm 8').strip()
            # Clean up the output by stripping all non-alphanumeric noise characters
            text = re.sub(r'[^A-Za-z0-9]', '', text)
            if not text:
                text = "UNKNOWN"
        except NameError:
            # Fallback if tesseract is not available for standard testing workflow
            time.sleep(2) # simulate processing latency
            text = "DUMMY123"
            
        print(f"Solved Captcha: {text}")
        return jsonify({"solved_text": text}), 200

    except Exception as e:
        print(f"Error decoding image: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Starting IRCTC Extension OCR API on http://localhost:5000")
    app.run(port=5000, debug=True)
