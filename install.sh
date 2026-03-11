#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────
# LiveAvatar + Agentforce — Install & Start Script
#
# Usage:
#   ./install.sh                          Full install (credentials, deps, start)
#   ./server.sh                           Quick start (see server.sh)
#   ./server.sh https://kncb.nl           Quick start → proxy demo for customer site
#
# Testing:
#   Source the helpers:  INSTALL_LIB_ONLY=1 source install.sh
#   Run the test suite:  bash test/test_install.sh
# ─────────────────────────────────────────────────────────────────────

# ── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
fail()  { echo -e "${RED}✗${NC} $*"; exit 1; }
header() { echo -e "\n${BOLD}═══ $* ═══${NC}\n"; }

# Helper: set a value in .env.local
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env.local; then
    # Use | as sed delimiter since values may contain /
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env.local && rm -f .env.local.bak
  else
    echo "${key}=${value}" >> .env.local
  fi
}

# Helper: get current value from .env.local (empty string if unset)
get_env() {
  local key="$1"
  grep "^${key}=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^[[:space:]]*//' || true
}

# Helper: mask a secret for display
mask() {
  local val="$1"
  if [ -z "$val" ]; then
    echo "(empty)"
  elif [ ${#val} -le 8 ]; then
    echo "****"
  else
    echo "${val:0:4}****${val: -4}"
  fi
}

# Helper: build demo proxy URL from components
build_demo_url() {
  local customer_url="$1" brand_color="$2" lang="${3:-en}"
  local encoded_color="${brand_color/#\#/%23}"
  local encoded_url
  encoded_url=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$customer_url', safe=''))" 2>/dev/null || echo "$customer_url")
  echo "/demo?site=${encoded_url}&color=${encoded_color}&lang=${lang}"
}

# Helper: ensure URL has protocol
normalize_url() {
  local url="$1"
  if [[ ! "$url" =~ ^https?:// ]]; then
    echo "https://$url"
  else
    echo "$url"
  fi
}

# Helper: migrate old env var name to new name (only if new is empty)
migrate_env() {
  local old_key="$1" new_key="$2"
  local old_val new_val
  old_val=$(get_env "$old_key")
  new_val=$(get_env "$new_key")
  if [ -n "$old_val" ] && [ -z "$new_val" ]; then
    set_env "$new_key" "$old_val"
    ok "Migrated $old_key → $new_key"
  fi
}

# Helper: find the first available port starting from a given port
find_port() {
  local port="${1:-3000}"
  while lsof -iTCP:"$port" -sTCP:LISTEN &>/dev/null; do
    ((port++))
  done
  echo "$port"
}

# ── Reusable: navigate to the app directory ──────────────────────────
find_app_dir() {
  local script_source
  script_source="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

  if [ -f "liveavatar-app/package.json" ] && grep -q "liveavatar-agentforce-app" "liveavatar-app/package.json" 2>/dev/null; then
    cd liveavatar-app
  elif [ -f "package.json" ] && grep -q "liveavatar-agentforce-app" "package.json" 2>/dev/null; then
    : # already here
  elif [ -f "$script_source/liveavatar-app/package.json" ] && grep -q "liveavatar-agentforce-app" "$script_source/liveavatar-app/package.json" 2>/dev/null; then
    cd "$script_source/liveavatar-app"
  else
    fail "Cannot find liveavatar-app/. Run from the repo root or liveavatar-app/ directory."
  fi
}

# ── Reusable: handle Next.js dev lock ────────────────────────────────
handle_dev_lock() {
  if [ -f ".next/dev/lock" ]; then
    local lock_pid
    lock_pid=$(cat .next/dev/lock 2>/dev/null || true)
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
      warn "Another next dev is already running (PID $lock_pid)"
      read -p "  Kill it and restart? (Y/n): " kill_choice
      if [[ ! "$kill_choice" =~ ^[Nn]$ ]]; then
        kill "$lock_pid" 2>/dev/null && sleep 1
        ok "Stopped previous dev server"
      else
        local existing_port
        existing_port=$(lsof -iTCP -sTCP:LISTEN -Pan -p "$lock_pid" 2>/dev/null | grep -oE ':[0-9]+' | head -1 | tr -d ':' || echo '3000')
        ok "Existing server on port $existing_port"
        echo "$existing_port"
        return 1
      fi
    else
      rm -f .next/dev/lock
      ok "Removed stale dev lock file"
    fi
  fi
  return 0
}

# ── Reusable: start dev server with browser open ─────────────────────
start_dev_server() {
  local port="$1" open_url="$2"

  ok "Starting development server on port ${port}..."
  (
    for i in $(seq 1 30); do
      if curl -s -o /dev/null "http://localhost:${port}" 2>/dev/null; then
        if command -v open &>/dev/null; then
          open "$open_url"
        elif command -v xdg-open &>/dev/null; then
          xdg-open "$open_url"
        fi
        break
      fi
      sleep 1
    done
  ) &
  PORT=$port npm run dev -- --port "$port"
}

# ── If sourced for testing, stop here ────────────────────────────────
if [ "${INSTALL_LIB_ONLY:-}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

# ── Guard: interactive terminal required ─────────────────────────────
if [ ! -t 0 ]; then
  echo ""
  echo "This script needs an interactive terminal for credential prompts."
  echo ""
  echo "Run it like this instead:"
  echo "  git clone https://github.com/gthoppae/liveavatar-agentforce.git"
  echo "  cd liveavatar-agentforce"
  echo "  ./install.sh"
  echo ""
  exit 1
fi

# ── Step 1: Check prerequisites ─────────────────────────────────────
header "Checking prerequisites"

check_version() {
  local cmd="$1" min_major="$2" label="$3"
  if ! command -v "$cmd" &>/dev/null; then
    fail "$label not found. Please install $label and try again."
  fi
  local version
  version=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
  local major="${version%%.*}"
  if [ "$major" -lt "$min_major" ] 2>/dev/null; then
    fail "$label version $version found, need $min_major+. Please upgrade."
  fi
  ok "$label $version"
}

check_version node 20 "Node.js"
check_version npm 8 "npm"

if ! command -v git &>/dev/null; then
  fail "git not found. Please install git and try again."
fi
ok "git $(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"

if command -v sf &>/dev/null; then
  ok "Salesforce CLI (sf) found"
else
  warn "Salesforce CLI (sf) not found — optional, needed for org setup"
fi

# ── Step 2: Get into the project directory ───────────────────────────
header "Setting up project"

SCRIPT_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

if [ -f "liveavatar-app/package.json" ] && grep -q "liveavatar-agentforce-app" "liveavatar-app/package.json" 2>/dev/null; then
  cd liveavatar-app
  ok "Found liveavatar-app/ in current directory"
elif [ -f "package.json" ] && grep -q "liveavatar-agentforce-app" "package.json" 2>/dev/null; then
  ok "Already inside liveavatar-app/"
elif [ -f "$SCRIPT_SOURCE/liveavatar-app/package.json" ] && grep -q "liveavatar-agentforce-app" "$SCRIPT_SOURCE/liveavatar-app/package.json" 2>/dev/null; then
  cd "$SCRIPT_SOURCE/liveavatar-app"
  ok "Found liveavatar-app/ next to install.sh"
else
  info "Cloning repository..."
  if git clone https://github.com/gthoppae/liveavatar-agentforce.git; then
    cd liveavatar-agentforce/liveavatar-app
    ok "Cloned repository"
  else
    fail "Clone failed. Clone manually and run ./install.sh from the repo root."
  fi
fi

ok "Working in $(pwd)"

# ── Step 3: Install dependencies ─────────────────────────────────────
header "Installing dependencies"

if [ -d "node_modules" ]; then
  ok "node_modules/ exists — running npm install to update"
fi
npm install
ok "Dependencies installed"

# ── Step 4: Create .env.local ────────────────────────────────────────
header "Environment configuration"

if [ -f ".env.local" ]; then
  warn "Found existing .env.local"
  read -p "Overwrite with fresh template? (y/N): " overwrite
  if [[ "$overwrite" =~ ^[Yy]$ ]]; then
    cp .env.local.example .env.local
    ok "Replaced .env.local from template"
  else
    ok "Keeping existing .env.local"
  fi
else
  cp .env.local.example .env.local
  ok "Created .env.local from template"
fi

# ── Migrate old variable names ───────────────────────────────────────
migrate_env "HEYGEN_API_KEY" "LIVEAVATAR_API_KEY"

# Strip inline comments from values (old .env format used KEY="val" # comment)
# The app reads raw values, so quotes and comments cause failures
for key in LIVEAVATAR_API_KEY LIVEAVATAR_AVATAR_ID LIVEAVATAR_VOICE_ID \
           SF_INSTANCE_URL SF_CLIENT_ID SF_CLIENT_SECRET SF_AGENT_ID; do
  raw=$(grep "^${key}=" .env.local 2>/dev/null | head -1 | cut -d= -f2- || true)
  # Remove surrounding quotes and trailing comments
  cleaned=$(echo "$raw" | sed 's/^["'\''"]//;s/["'\''"].*$//' | sed 's/[[:space:]]*#.*//')
  if [ "$raw" != "$cleaned" ] && [ -n "$cleaned" ]; then
    set_env "$key" "$cleaned"
  fi
done

# Helper: prompt for a value, showing current if set
prompt_env() {
  local key="$1" label="$2" secret="${3:-false}"
  local current
  current=$(get_env "$key")

  if [ -n "$current" ]; then
    if [ "$secret" = "true" ]; then
      echo -e "  ${label}: [$(mask "$current")] (Enter to keep)"
    else
      echo -e "  ${label}: [${current}] (Enter to keep)"
    fi
  else
    echo -ne "  ${label}: "
  fi

  local value
  if [ "$secret" = "true" ]; then
    read -sp "" value
    echo ""
  else
    read -p "" value
  fi

  if [ -n "$value" ]; then
    set_env "$key" "$value"
  fi
}

# ── Step 5: Gather credentials ───────────────────────────────────────
header "HeyGen LiveAvatar"
echo "  Get your API key from https://liveavatar.com"
echo ""
prompt_env "LIVEAVATAR_API_KEY" "API Key" true
prompt_env "LIVEAVATAR_AVATAR_ID" "Avatar ID (from dashboard or /admin)"
prompt_env "LIVEAVATAR_VOICE_ID" "Voice ID (from dashboard or /admin)"

header "Salesforce Agentforce"
echo "  You need a Connected App with Client Credentials flow."
echo "  See INSTALL.md for step-by-step Salesforce setup."
echo ""
prompt_env "SF_INSTANCE_URL" "Instance URL (e.g., https://your-org.my.salesforce.com)"
prompt_env "SF_CLIENT_ID" "Client ID (Consumer Key)" true
prompt_env "SF_CLIENT_SECRET" "Client Secret" true
prompt_env "SF_AGENT_ID" "Agent ID (starts with 0Xx)"

# ── Step 6: Optional config ─────────────────────────────────────────
header "Optional configuration"
prompt_env "ADMIN_PASSWORD" "Admin panel password (Enter to skip)" true

echo ""
current_lang=$(get_env "LIVEAVATAR_LANGUAGE")
echo -ne "  Language code [${current_lang:-en}]: "
read lang_input
if [ -n "$lang_input" ]; then
  set_env "LIVEAVATAR_LANGUAGE" "$lang_input"
fi

# ── Step 7: Customer demo setup ─────────────────────────────────────
header "Customer Demo Setup (optional)"
echo "  The app can proxy any customer website and overlay the AI avatar"
echo "  chat widget — the customer sees their site with a chat button."
echo ""

read -p "  Customer website URL (Enter to skip): " customer_url

DEMO_URL=""
if [ -n "$customer_url" ]; then
  customer_url=$(normalize_url "$customer_url")

  read -p "  Brand color hex (e.g., #ff6600): " brand_color
  brand_color="${brand_color:-#0077b6}"

  read -p "  Customer name (for quick link label): " customer_name

  demo_lang=$(get_env "LIVEAVATAR_LANGUAGE")
  demo_lang="${demo_lang:-en}"

  # Persist for server.sh to reuse
  set_env "DEMO_CUSTOMER_URL" "$customer_url"
  set_env "DEMO_BRAND_COLOR" "$brand_color"

  DEMO_URL=$(build_demo_url "$customer_url" "$brand_color" "$demo_lang")

  echo ""
  ok "Demo proxy URL (port will be confirmed at startup):"
  echo -e "  ${BOLD}http://localhost:<port>${DEMO_URL}${NC}"
  echo ""

  if [ -n "$customer_name" ]; then
    echo "  To add as a quick link on the /demo page, add to"
    echo "  src/app/demo/page.tsx in the quick links array:"
    echo ""
    echo "    { label: '${customer_name}', url: '${customer_url}', color: '${brand_color}' },"
    echo ""
  fi
fi

# ── Step 8: Find available port ──────────────────────────────────────
PORT=$(find_port 3000)
if [ "$PORT" -ne 3000 ]; then
  warn "Port 3000 is in use — will use port $PORT"
else
  ok "Port 3000 is available"
fi

# ── Step 9: Summary ─────────────────────────────────────────────────
header "Setup Complete"

echo "  HeyGen API Key:    $(mask "$(get_env LIVEAVATAR_API_KEY)")"
echo "  Avatar ID:         $(get_env LIVEAVATAR_AVATAR_ID)"
echo "  SF Instance:       $(get_env SF_INSTANCE_URL)"
echo "  SF Agent ID:       $(get_env SF_AGENT_ID)"
echo "  Language:          $(get_env LIVEAVATAR_LANGUAGE)"
if [ -n "$DEMO_URL" ]; then
  echo ""
  echo "  Demo URL:          http://localhost:${PORT}${DEMO_URL}"
fi
echo ""

# ── Step 10: Start the app ──────────────────────────────────────────
echo -e "  ${BOLD}Start options:${NC}"
echo "    1) npm run dev          — development server (localhost:${PORT})"
echo "    2) Docker               — containerized (localhost:${PORT})"
echo "    3) Exit"
echo ""
read -p "  Choose [1/2/3]: " start_choice

case "$start_choice" in
  1)
    echo ""
    if ! handle_dev_lock; then
      break
    fi
    if [ -n "$DEMO_URL" ]; then
      OPEN_URL="http://localhost:${PORT}${DEMO_URL}"
    else
      OPEN_URL="http://localhost:${PORT}"
    fi
    start_dev_server "$PORT" "$OPEN_URL"
    ;;
  2)
    echo ""
    info "Building Docker image..."
    docker build -t liveavatar .
    ok "Starting container on port ${PORT}..."
    if [ -n "$DEMO_URL" ]; then
      echo -e "  Open: ${BOLD}http://localhost:${PORT}${DEMO_URL}${NC}"
    fi
    docker run -p "${PORT}:3000" --env-file .env.local liveavatar
    ;;
  *)
    echo ""
    if [ -n "$DEMO_URL" ]; then
      ok "When ready, run:"
      echo "    PORT=${PORT} npm run dev -- --port ${PORT}"
      echo ""
      echo "  Then open:"
      echo "    http://localhost:${PORT}${DEMO_URL}"
    else
      ok "Run 'PORT=${PORT} npm run dev -- --port ${PORT}' when ready."
    fi
    ;;
esac

# ── Step 10: Claude Code hint ────────────────────────────────────────
if command -v claude &>/dev/null; then
  echo ""
  echo -e "  ${BLUE}Tip:${NC} Claude Code detected! Run ${BOLD}/setup-customer${NC} for an"
  echo "  AI-guided experience that auto-detects branding and orchestrates"
  echo "  Salesforce org setup."
fi
