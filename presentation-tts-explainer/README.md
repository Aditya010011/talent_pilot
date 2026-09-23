# NarrativeAI - Slide Commentary & TTS Walkthrough

NarrativeAI is a local web application that converts PowerPoint (`.pptx`) slides into high-quality images, generates coaching-style class commentary, and synthesizes audio explanations for each slide using Azure OpenAI.

---

## 🔒 Handling Credentials Safely (Do NOT Commit API Keys)

To keep your Azure OpenAI API keys secure, **never commit keys directly to files that are tracked by Git.**

### UI Configuration Panel (Recommended)
1. Open the web app in your browser.
2. Click the ⚙️ **Settings Gear** icon in the top header.
3. Enter your Azure OpenAI credentials:
   - **Azure Endpoint**: Your resource endpoint URL (e.g. `https://resource-name.cognitiveservices.azure.com/`)
   - **API Key**: Your secret API key
   - **Deployment Name**: The model deployment name (e.g. `gpt-4o`)
   - **API Version**: The API version you want to target (e.g. `2024-02-15-preview`)
4. Click **Save & Apply Settings**. The application stores these configurations locally in your browser (`localStorage`), so they persist across refreshes without being committed to git.

---

## 🛠️ Setup & Running Instructions

Follow these steps to run the application locally on your machine.

### Step 1: Install LibreOffice
The local converter server uses LibreOffice to convert `.pptx` slides into high-quality images.

* **macOS:**
  ```bash
  brew install --cask libreoffice
  ```
* **Linux (Ubuntu/Debian):**
  ```bash
  sudo apt-get install libreoffice poppler-utils
  ```
* **Windows:**
  Download and install from the [LibreOffice Official Site](https://www.libreoffice.org/).

### Step 2: Start the Conversion Server
Activate the Python virtual environment and run the backend script.

```bash
# 1. Navigate to the project root
cd presentation-explain-tts

# 2. Activate virtual environment
source venv/bin/activate

# 3. Start the conversion server
python3 slide_converter_server.py
```
The server will start on `http://localhost:5001`. Keep this terminal window open.

### Step 3: Run the Web Application
Serve `code.html` using a simple local HTTP server:

```bash
# Run a local server (in a separate terminal window)
python3 -m http.server 8000
```
Open your browser and navigate to:
👉 **[http://localhost:8000/code.html](http://localhost:8000/code.html)**

---

## 🚀 How to Use the App
1. Click the ⚙️ **Settings Gear** icon in the header to make sure your Azure OpenAI Endpoint and Key are set.
2. Click **Upload PPTX** and select your presentation file.
3. The app converts the slides to high-quality thumbnails using the backend server.
4. The AI generates slide commentary in your chosen language.
5. Click any thumbnail to view the slide, edit its commentary, and play the synthesized speech.
6. Use the playback controls to play/pause, rewind, skip, or change target languages.
