#!/bin/zsh
cd "$(dirname "$0")"

export PORT=3001
export NODE_ENV=development
export TMPDIR=/private/tmp
export HTTPS_PROXY=http://127.0.0.1:4780
export HTTP_PROXY=http://127.0.0.1:4780
export COREPACK_HOME="$PWD/.cache/corepack"
export PNPM_HOME="$PWD/.cache/pnpm"
export PNPM_STORE_DIR="$PWD/.cache/pnpm-store"

LOG_FILE="$PWD/hyperliquid-server.log"

clear
echo "Starting Hyperliquid real-data dashboard..."
echo "Project folder:"
echo "$PWD"
echo
echo "If the server starts successfully, open this link:"
echo "http://127.0.0.1:3001/"
echo
echo "Logs will be saved to:"
echo "$LOG_FILE"
echo

echo "Checking local setup..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Please install Node.js first."
  echo
  echo "Press Enter to close this window."
  read
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Dependencies are missing. Installing them now..."
  corepack pnpm install
fi

echo
echo "Launching server..."
echo "----- $(date) -----" >> "$LOG_FILE"

EXISTING_PIDS=$(lsof -ti tcp:3001 2>/dev/null | tr '\n' ' ')
if [ -n "$EXISTING_PIDS" ]; then
  echo "Port 3001 is already in use. Stopping old local server first..."
  echo "Stopping old local server pids: $EXISTING_PIDS" >> "$LOG_FILE"
  kill $EXISTING_PIDS 2>/dev/null
  sleep 2
fi

node --import tsx server/_core/index.ts 2>&1 | tee -a "$LOG_FILE"

echo
echo "Server stopped or failed to start."
echo "Please send me the last lines shown above, or this log file:"
echo "$LOG_FILE"
echo
echo "Press Enter to close this window."
read
