#!/usr/bin/env bash
# Quantum Trade Pro — open/start launcher.
set -e
cd "$(dirname "$0")"
PIDFILE=".qpro.pid"
PORT="${PORT:-8080}"
URL="http://localhost:$PORT"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$URL"
  fi
  echo "Quantum Trade Pro is already running — browser opened at $URL"
  exit 0
fi

rm -f "$PIDFILE"
nohup node server.js > .qpro.log 2>&1 &
echo $! > "$PIDFILE"
sleep 1

if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  rm -f "$PIDFILE"
  echo "Failed to start — see .qpro.log"
  cat .qpro.log 2>/dev/null || true
  exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v python3 >/dev/null 2>&1; then
  python3 -m webbrowser "$URL" >/dev/null 2>&1 &
fi

echo "Quantum Trade Pro opened at $URL"