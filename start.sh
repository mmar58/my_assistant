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

# ── Copy .env files if missing ─────────────────────────────────────────────────
for pkg in backend tools; do
  if [ ! -f "$ROOT/$pkg/.env" ]; then
    if [ -f "$ROOT/$pkg/.env.example" ]; then
      cp "$ROOT/$pkg/.env.example" "$ROOT/$pkg/.env"
      echo "⚠  Created $pkg/.env from .env.example — fill in DATABASE_URL before continuing."
      echo "   Edit: $ROOT/$pkg/.env"
      echo ""
    fi
  fi
done

# ── Run DB migration ────────────────────────────────────────────────────────────
echo "→ Applying database migrations..."
DB_URL=$(grep DATABASE_URL "$ROOT/backend/.env" | cut -d= -f2-)
if [ -z "$DB_URL" ]; then
  echo "  ⚠  DATABASE_URL not set in backend/.env — skipping migration."
else
  psql "$DB_URL" -f "$ROOT/backend/migrations/001_init.sql" > /dev/null 2>&1 \
    && echo "  ✓ Migration applied" \
    || echo "  ⚠  Migration may have failed (or already applied) — continuing."
fi
echo ""

# ── Install dependencies ────────────────────────────────────────────────────────
echo "→ Installing backend dependencies..."
(cd "$ROOT/backend" && pnpm install --silent)

echo "→ Installing tools dependencies..."
(cd "$ROOT/tools" && pnpm install --silent)

echo "→ Installing frontend dependencies..."
(cd "$ROOT/frontend" && pnpm install --silent)

echo ""

# ── Start services ──────────────────────────────────────────────────────────────
echo "→ Starting tools service (port 3001)..."
(cd "$ROOT/tools" && pnpm dev) &
TOOLS_PID=$!

echo "→ Starting backend (port 3000)..."
node "$ROOT/watcher.mjs" &
WATCHER_PID=$!

if [[ "$1" != "--no-frontend" ]]; then
  echo "→ Starting frontend (port 5173)..."
  (cd "$ROOT/frontend" && pnpm dev) &
  FRONTEND_PID=$!
fi

echo ""
echo "✓ Stack running:"
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:3000"
echo "  Tools:     http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

cleanup() {
  echo ""
  echo "Stopping all services..."
  kill $WATCHER_PID 2>/dev/null || true
  kill $TOOLS_PID 2>/dev/null || true
  if [ -n "$FRONTEND_PID" ]; then
    kill $FRONTEND_PID 2>/dev/null || true
  fi
  echo "Done."
}

trap cleanup INT TERM
wait
