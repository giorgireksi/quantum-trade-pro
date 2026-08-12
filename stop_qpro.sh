#!/usr/bin/env bash
# Quantum Trade Pro — close/stop launcher.
set -e
cd "$(dirname "$0")"
PIDFILE=".qpro.pid"

if [ ! -f "$PIDFILE" ]; then
  echo "Quantum Trade Pro is not running."
  exit 0
fi

PID="$(cat "$PIDFILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.2
  done
  kill -9 "$PID" 2>/dev/null || true
  echo "Quantum Trade Pro stopped."
else
  echo "Quantum Trade Pro was already stopped."
fi
rm -f "$PIDFILE"