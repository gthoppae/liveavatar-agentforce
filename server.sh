#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────
# LiveAvatar + Agentforce — Quick Start Server
#
# Usage:
#   ./server.sh                          Start dev server, open browser
#   ./server.sh https://www.kncb.nl      Start → proxy demo for customer site
#   ./server.sh kncb.nl '#ff6600'        Start → proxy demo with brand color
#   ./server.sh kncb.nl '#ff6600' nl     Start → proxy demo with color + language
# ─────────────────────────────────────────────────────────────────────

# Source shared helpers from setup.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
INSTALL_LIB_ONLY=1 source "$SCRIPT_DIR/setup.sh"

# ── Find the app directory ───────────────────────────────────────────
find_app_dir

# ── Find available port ──────────────────────────────────────────────
PORT=$(find_port 3000)
if [ "$PORT" -ne 3000 ]; then
  warn "Port 3000 is in use — using port $PORT"
else
  ok "Port $PORT is available"
fi

# ── Handle existing dev server lock ──────────────────────────────────
if ! handle_dev_lock; then
  exit 0
fi

# ── Build demo URL: args > .env.local > plain localhost ───────────────
DEMO_URL=""
lang="${3:-$(get_env "LIVEAVATAR_LANGUAGE" 2>/dev/null || echo "en")}"
lang="${lang:-en}"

if [ -n "${1:-}" ]; then
  # Explicit args: ./server.sh <url> [color] [lang]
  customer_url=$(normalize_url "$1")
  brand_color="${2:-#0077b6}"
  DEMO_URL=$(build_demo_url "$customer_url" "$brand_color" "$lang")
else
  # Fall back to saved customer from setup.sh
  saved_url=$(get_env "DEMO_CUSTOMER_URL" 2>/dev/null || true)
  if [ -n "$saved_url" ]; then
    saved_color=$(get_env "DEMO_BRAND_COLOR" 2>/dev/null || echo "#0077b6")
    saved_color="${saved_color:-#0077b6}"
    DEMO_URL=$(build_demo_url "$saved_url" "$saved_color" "$lang")
    ok "Using saved customer: $saved_url"
  fi
fi

if [ -n "$DEMO_URL" ]; then
  OPEN_URL="http://localhost:${PORT}${DEMO_URL}"
else
  OPEN_URL="http://localhost:${PORT}"
fi

echo ""
echo -e "  ${BOLD}${OPEN_URL}${NC}"
echo ""

start_dev_server "$PORT" "$OPEN_URL"
