#!/usr/bin/env bash
# Quantum Trade Pro — one-click open/close.
# First run: starts the backend and opens the browser.
# Run again: stops the backend.
set -e
cd "$(dirname "$0")"
PIDFILE=".qpro.pid"
PORT="${PORT:-8080}"
URL="http://localhost:$PORT"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  kill "$(cat "$PIDFILE")" 2>/dev/null
  rm -f "$PIDFILE"
  echo "Quantum Trade Pro stopped."
else
  nohup node server.js > .qpro.log 2>&1 &
  echo $! > "$PIDFILE"
  sleep 1
  if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Failed to start — see .qpro.log"; cat .qpro.log; exit 1
  fi
  echo "Quantum Trade Pro running at $URL  (run ./qpro.sh again to stop)"
  if command -v xdg-open >/dev/null 2>&1; then (xdg-open "$URL" >/dev/null 2>&1 &)
  elif command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v python3 >/dev/null 2>&1; then python3 -m webbrowser "$URL"
  fi
fi