#!/bin/bash
# ui-ux-magec setup for macOS/Linux. Double-click in Finder or run: ./setup.command [--yes|--non-interactive|--dry-run]
set -uo pipefail
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required but was not found."
  echo "Install it from https://nodejs.org (or: brew install node), then run this script again."
  exit 1
fi

node scripts/setup.mjs "$@"
status=$?

# When double-clicked (no arguments, interactive), keep the window open so the output can be read.
if [ "$#" -eq 0 ] && [ -t 0 ] && [ "${MAGEC_SETUP_NO_PAUSE:-}" != "1" ]; then
  read -r -p "Press Enter to close…" _ || true
fi
exit $status
