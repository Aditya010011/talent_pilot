#!/usr/bin/env python3
"""
PPTX to Image Converter - Server
Converts PowerPoint slides to high-quality images using LibreOffice.

Setup:
1. Install LibreOffice: brew install --cask libreoffice (Mac) or apt-get install libreoffice (Linux)
2. Install dependencies: pip3 install flask flask-cors Pillow
3. Run: python3 slide_converter_server.py
4. The server will start on http://localhost:5000

API Endpoints:
- POST /convert - Upload PPTX and get slide images
- GET /health - Check server status
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess
import os
import shutil
import zipfile
from pathlib import Path
from PIL import Image
import io
import tempfile
import base64

app = Flask(__name__)
CORS(app)  # Enable CORS for browser requests

# Configuration
UPLOAD_FOLDER = tempfile.mkdtemp(prefix='pptx_converter_')
OUTPUT_FOLDER = os.path.join(UPLOAD_FOLDER, 'output')
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

def get_libreoffice_path():
    """Find LibreOffice executable path"""
    # Standard command
    if shutil.which('libreoffice'):
        return 'libreoffice'
    
    # Common Mac paths
    mac_paths = [
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
        '/usr/local/bin/libreoffice',
        '/opt/homebrew/bin/libreoffice'
    ]
    for path in mac_paths:
        if os.path.exists(path):
            return path
            
    return None

def check_libreoffice():
    """Check if LibreOffice is installed"""
    path = get_libreoffice_path()
    if not path:
        return False
    try:
        result = subprocess.run([path, '--version'], 
                              capture_output=True, text=True)
        return result.returncode == 0
    except Exception:
        return False

def convert_pptx_to_pdf(pptx_path, output_dir):
    """Convert PPTX to PDF using LibreOffice"""
    libreoffice_path = get_libreoffice_path()
    if not libreoffice_path:
        print("Error: LibreOffice path not found")
        return None
        
    try:
        cmd = [
            libreoffice_path,
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', output_dir,
            pptx_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            # Find the generated PDF
            pdf_files = list(Path(output_dir).glob('*.pdf'))
            if pdf_files:
                return str(pdf_files[0])
        
        print(f"LibreOffice error: {result.stderr}")
        return None
    except Exception as e:
        print(f"Conversion error: {e}")
        return None

def pdf_to_images(pdf_path, output_dir, scale=2.0):
    """Convert PDF pages to images using pdftoppm or fallback to manual extraction"""
    try:
        # Try using pdftoppm (comes with poppler-utils)
        pdftoppm_path = shutil.which('pdftoppm') or 'pdftoppm'
        cmd = [
            pdftoppm_path,
            '-jpeg',
            '-r', str(int(150 * scale)),  # DPI
            pdf_path,
            os.path.join(output_dir, 'slide')
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        
        if result.returncode == 0:
            # Get all generated images
            images = sorted(Path(output_dir).glob('slide-*.jpg'))
            return [str(img) for img in images]
        
        print(f"pdftoppm error: {result.stderr}")
    except Exception as e:
        print(f"pdftoppm not available: {e}")
    
    # Fallback: return None to indicate failure
    return None

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    libreoffice_available = check_libreoffice()
    
    return jsonify({
        'status': 'ok',
        'libreoffice': libreoffice_available,
        'message': 'Server running' if libreoffice_available else 'LibreOffice not installed'
    })

@app.route('/convert', methods=['POST'])
def convert_slides():
    """Convert PPTX to images"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith('.pptx'):
        return jsonify({'error': 'File must be .pptx'}), 400
    
    # Create temp directory for this request
    request_id = f"req_{os.urandom(8).hex()}"
    request_dir = os.path.join(UPLOAD_FOLDER, request_id)
    os.makedirs(request_dir, exist_ok=True)
    
    try:
        # Save uploaded file
        pptx_path = os.path.join(request_dir, 'upload.pptx')
        file.save(pptx_path)
        
        # Convert to PDF
        print(f"Converting PPTX to PDF...")
        pdf_path = convert_pptx_to_pdf(pptx_path, request_dir)
        
        if not pdf_path:
            return jsonify({'error': 'Failed to convert PPTX to PDF'}), 500
        
        # Convert PDF to images
        print(f"Converting PDF to images...")
        image_paths = pdf_to_images(pdf_path, request_dir)
        
        if not image_paths:
            return jsonify({'error': 'Failed to convert PDF to images'}), 500
        
        # Convert images to base64
        slides = []
        for img_path in image_paths:
            with open(img_path, 'rb') as img_file:
                img_data = base64.b64encode(img_file.read()).decode('utf-8')
                slides.append({
                    'image': f'data:image/jpeg;base64,{img_data}'
                })
        
        print(f"Successfully converted {len(slides)} slides")
        
        return jsonify({
            'success': True,
            'slides': slides,
            'count': len(slides)
        })
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
    finally:
        # Cleanup
        try:
            shutil.rmtree(request_dir, ignore_errors=True)
        except:
            pass
 
@app.route('/convert/base64', methods=['POST'])
def convert_slides_base64():
    """Convert PPTX (base64) to images"""
    data = request.json
    if 'pptx_base64' not in data:
        return jsonify({'error': 'No pptx_base64 provided'}), 400
    
    # Create temp directory
    request_id = f"req_{os.urandom(8).hex()}"
    request_dir = os.path.join(UPLOAD_FOLDER, request_id)
    os.makedirs(request_dir, exist_ok=True)
    
    try:
        # Decode and save PPTX
        pptx_path = os.path.join(request_dir, 'upload.pptx')
        pptx_data = base64.b64decode(data['pptx_base64'])
        with open(pptx_path, 'wb') as f:
            f.write(pptx_data)
        
        # Convert to PDF
        pdf_path = convert_pptx_to_pdf(pptx_path, request_dir)
        if not pdf_path:
            return jsonify({'error': 'Failed to convert to PDF'}), 500
        
        # Convert to images
        image_paths = pdf_to_images(pdf_path, request_dir)
        if not image_paths:
            return jsonify({'error': 'Failed to convert to images'}), 500
        
        # Convert to base64
        slides = []
        for img_path in image_paths:
            with open(img_path, 'rb') as img_file:
                img_data = base64.b64encode(img_file.read()).decode('utf-8')
                slides.append(f'data:image/jpeg;base64,{img_data}')
        
        return jsonify({
            'success': True,
            'slides': slides,
            'count': len(slides)
        })
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500
    
    finally:
        try:
            shutil.rmtree(request_dir, ignore_errors=True)
        except:
            pass
 
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    
    print("=" * 60)
    print("PPTX to Image Converter Server")
    print("=" * 60)
    
    if check_libreoffice():
        print("✅ LibreOffice is installed")
        print(f"   Path: {get_libreoffice_path()}")
    else:
        print("❌ LibreOffice NOT installed!")
        print("\nInstall it with:")
        print("  Mac: brew install --cask libreoffice")
        print("  Linux: sudo apt-get install libreoffice")
        print("  Windows: Download from https://www.libreoffice.org/")
    
    print(f"\nServer starting on http://localhost:{port}")
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print("\nEndpoints:")
    print("  POST /convert - Upload PPTX file")
    print("  POST /convert/base64 - Send PPTX as base64")
    print("  GET /health - Check server status")
    print("=" * 60)
    
    app.run(host='localhost', port=port, debug=True)

