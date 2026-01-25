#!/bin/bash

# Function to kill processes on exit
cleanup() {
    echo "Stopping servers..."
    kill $(jobs -p)
    exit
}

trap cleanup SIGINT SIGTERM

# Activate Python Environment
source venv/bin/activate

# Start Backend
echo "Starting Audio Engine..."
# Run from root using uvicorn module syntax to resolve 'engine' package correctly
uvicorn engine.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start Frontend
echo "Starting Frontend..."
cd frontend
# Check for stale lock file from previous crash (optional, but effectively we just run dev)
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for both
wait $BACKEND_PID $FRONTEND_PID
