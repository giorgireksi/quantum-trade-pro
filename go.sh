#!/usr/bin/env bash
# ChartLab one-click launcher: start / stop / toggle the dev platform.
#   ./go.sh start   - run server (background) + open browser
#   ./go.sh stop    - stop the server
#   ./go.sh toggle  - one click: start if stopped, stop if running
#   ./go.sh status  - print state
set -u
cd "$(dirname "$0")"
PORT=5173
URL="http://localhost:$PORT"
PID_FILE="/tmp/chartlab.pid"

running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && return 0
  rm -f "$PID_FILE"
  return 1
}

start() {
  if running; then
    echo "already running on $URL"
  else
    nohup ./node_modules/.bin/vite --port "$PORT" --strictPort > /tmp/chartlab.log 2>&1 &
    echo $! > "$PID_FILE"
    for _ in $(seq 1 60); do
      curl -sf "$URL" > /dev/null 2>&1 && break
      sleep 0.25
    done
    echo "running on $URL (log: /tmp/chartlab.log)"
  fi
  if command -v xdg-open > /dev/null 2>&1; then xdg-open "$URL" > /dev/null 2>&1 & fi
}

stop() {
  if running; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    rm -f "$PID_FILE"
    echo "stopped"
  else
    echo "not running"
  fi
}

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  toggle)  if running; then stop; else start; fi ;;
  status)  running && echo "running on $URL" || echo "stopped" ;;
  *)       echo "usage: ./go.sh [start|stop|toggle|status]" >&2; exit 1 ;;
esac
