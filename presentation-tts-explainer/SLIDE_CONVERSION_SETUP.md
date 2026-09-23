# High-Quality Slide Thumbnail Setup

## Overview

This app now supports **high-quality slide rendering** using a local conversion server. This renders the **entire slide** as an image, not just extracted images.

## Quick Start

### Step 1: Install LibreOffice

**Mac:**
```bash
brew install --cask libreoffice
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install libreoffice poppler-utils
```

**Windows:**
Download from https://www.libreoffice.org/download/

### Step 2: Install Python Dependencies

```bash
# Activate the virtual environment (if not already active)
source venv/bin/activate

# Install required packages
pip install flask flask-cors Pillow
```

### Step 3: Start the Conversion Server

```bash
python3 slide_converter_server.py
```

You should see:
```
============================================================
PPTX to Image Converter Server
============================================================
✅ LibreOffice is installed

Server starting on http://localhost:5000
...
============================================================
```

### Step 4: Use the App

1. Keep the server running in a terminal
2. Open `code.html` in your browser
3. Upload a PPTX file
4. The app will automatically convert slides to high-quality images!

## How It Works

1. **Upload** - You upload a PPTX file in the browser
2. **Convert to PDF** - LibreOffice converts PPTX to PDF (preserves all formatting)
3. **Render to Images** - Each PDF page is rendered as a high-quality JPEG
4. **Display** - Images are sent back to the browser and shown as thumbnails

## Benefits

✅ **Full Slide Rendering** - Shows the entire slide, not just embedded images  
✅ **High Quality** - 300 DPI rendering for crisp, clear thumbnails  
✅ **Perfect Formatting** - LibreOffice preserves layouts, fonts, and colors  
✅ **Privacy** - All processing happens locally on your machine  
✅ **Fast** - Usually completes in 2-5 seconds  

## Troubleshooting

### "Local server not available" message

**Cause**: The conversion server is not running

**Fix**:
```bash
source venv/bin/activate
python3 slide_converter_server.py
```

### "LibreOffice NOT installed" message

**Cause**: LibreOffice is not installed or not in PATH

**Fix**:
- Mac: `brew install --cask libreoffice`
- Linux: `sudo apt-get install libreoffice`
- Windows: Download from libreoffice.org

### Slow conversion

**Cause**: Large PPTX files or many slides

**Fix**: This is normal. A 20-slide presentation typically takes 3-5 seconds.

### pdftoppm not found

**Cause**: Missing poppler-utils (Linux only)

**Fix**:
```bash
sudo apt-get install poppler-utils
```

## API Reference

If you want to use the server independently:

### POST /convert
Upload a PPTX file directly:
```bash
curl -X POST -F "file=@presentation.pptx" http://localhost:5000/convert
```

### POST /convert/base64
Send PPTX as base64 (used by the web app):
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"pptx_base64": "..."}' \
  http://localhost:5000/convert/base64
```

### GET /health
Check server status:
```bash
curl http://localhost:5000/health
```

## Fallback Behavior

If the conversion server is not running, the app will automatically fall back to:
1. Extracting images directly from the PPTX file
2. If no images found, showing text preview only

The app works perfectly without the server - you just won't get full slide renders.

## Production Deployment

For production use, consider:
1. Running the server as a systemd service (Linux) or launchd service (Mac)
2. Using gunicorn instead of Flask's development server:
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:5000 slide_converter_server:app
   ```
3. Adding authentication if exposing to the internet

## Architecture

```
Browser (code.html)
    ↓ (base64 PPTX)
Local Server (slide_converter_server.py)
    ↓ (LibreOffice)
PDF File
    ↓ (pdftoppm)
JPEG Images
    ↓ (base64)
Browser Thumbnails
```

All processing happens locally - no files are uploaded to any external service!
