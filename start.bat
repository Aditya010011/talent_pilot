@echo off
setlocal enabledelayedexpansion

:: Kimiyi AI Startup Script for Windows
:: This script starts the 3 core services required for the AI interview platform.

echo 🚀 Starting Kimiyi AI Services...

:: 0. Start Supabase (Docker)
echo 🗄️ Starting Supabase Database...
call npx supabase start


:: 1. Start the Emotion Analysis Service (Python)
echo 🧠 Starting Emotion Analysis Service...
if exist "server\analysis\venv" (
    start /B cmd /c "call server\analysis\venv\Scripts\activate && python server\analysis\emotion_service.py"
) else (
    echo ⚠️ Warning: Python venv not found at server\analysis\venv. Starting with system python...
    start /B cmd /c "python server\analysis\emotion_service.py"
)

:: 2. Start the Google Voice Relay (Node.js)
echo 🎙️ Starting Google Voice Relay...
start /B cmd /c "npm run dev:google-voice"

:: 3. Start the Next.js Development Server (Frontend)
echo 🌐 Starting Next.js Dev Server...
echo ----------------------------------------------------
echo Main Application: http://localhost:3000
echo Close this window to stop all services.
echo ----------------------------------------------------
npm run dev
