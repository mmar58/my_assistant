#!/bin/bash
# start.sh — Starts the full self-improving assistant stack
# Usage: ./start.sh [--no-frontend]

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Self-Improving AI Assistant            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Copy .env files if they don't exist
if [ ! -f "$ROOT/backend/.env" ]; then
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "⚠  Created backend/.env from .env.example — please review it."
fi

if [ ! -f "$ROOT/api-modules/.env" ]; then
  cp "$ROOT/api-modules/.env.example" "$ROOT/api-modules/.env"
  echo "⚠  Created api-modules/.env from .env.example — please review it."
fi

# Install dependencies
echo "→ Installing api-modules dependencies..."
(cd "$ROOT/api-modules" && pnpm install --silent)

echo "→ Installing backend dependencies..."
(cd "$ROOT/backend" && pnpm install --silent)

echo "→ Installing frontend dependencies..."
(cd "$ROOT/frontend" && pnpm install --silent)

echo ""
echo "→ Starting api-modules (port 3001)..."
(cd "$ROOT/api-modules" && pnpm dev) &
API_PID=$!

echo "→ Starting watcher + backend (watcher manages backend lifecycle)..."
node "$ROOT/watcher.mjs" &
WATCHER_PID=$!

if [[ "$1" != "--no-frontend" ]]; then
  echo "→ Starting frontend (port 5173)..."
  (cd "$ROOT/frontend" && pnpm dev) &
  FRONTEND_PID=$!
fi

echo ""
echo "✓ Stack running:"
echo "  Frontend:   http://localhost:5173"
echo "  Backend:    http://localhost:3000"
echo "  api-modules: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Trap Ctrl+C and cleanup
cleanup() {
  echo ""
  echo "Stopping all services..."
  kill $WATCHER_PID 2>/dev/null || true
  kill $API_PID 2>/dev/null || true
  if [ -n "$FRONTEND_PID" ]; then
    kill $FRONTEND_PID 2>/dev/null || true
  fi
  echo "Done."
}

trap cleanup INT TERM

# Wait for any process to exit
wait
