#!/bin/bash

# Kimiyi AI Startup Script
# This script starts the core services required for the AI interview platform.
#
# Usage:
#   ./start.sh             — Start all services (SKIPS Supabase/Docker for safety)
#   ./start.sh --supabase  — Also start the local Supabase Docker stack

# Function to handle cleanup on exit (kills background processes)
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    # Kill all background jobs started by this shell
    kill $(jobs -p) 2>/dev/null
    exit
}

# Trap Ctrl+C (SIGINT) and terminal exit (SIGTERM)
trap cleanup SIGINT SIGTERM

echo "🚀 Starting Kimiyi AI Services..."

# 0. Optionally start Supabase (Docker) — only if --supabase flag is passed
if [[ "$1" == "--supabase" ]]; then
    echo "🗄️ Starting Supabase Database..."
    npx supabase start
else
    echo "🗄️ Skipping Supabase start (pass --supabase to enable). Assuming it is already running."
fi

# 1. Start the Emotion Analysis Service (Python)
echo "🧠 Starting Emotion Analysis Service..."
mkdir -p logs
if [ -d "server/analysis/venv" ]; then
    source server/analysis/venv/bin/activate
    python server/analysis/emotion_service.py >> logs/emotion.log 2>&1 &
else
    echo "⚠️ Warning: Python venv not found at server/analysis/venv. Starting with system python..."
    python server/analysis/emotion_service.py >> logs/emotion.log 2>&1 &
fi

# 2. Start the Google Voice Relay (Node.js)
echo "🎙️ Starting Google Voice Relay..."
npm run dev:google-voice >> logs/voice.log 2>&1 &

# 3. Start the Next.js Development Server (Frontend)
echo "🌐 Starting Next.js Dev Server (Port 3001)..."
npm run dev -- -p 3001 >> logs/next.log 2>&1 &

# 4. Start the Unified Gateway (Port 3000)
echo "🌉 Starting Unified Gateway (Port 3000)..."
echo "----------------------------------------------------"
PUBLIC_IP="$(curl -s -m 2 -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)"
if [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
echo "Kimiyi AI is available at: http://${PUBLIC_IP:-localhost}:3000"
echo "(Production domain: https://app.inluwa.com)"
echo "Press Ctrl+C to stop all services."
echo "----------------------------------------------------"
node gateway.js
