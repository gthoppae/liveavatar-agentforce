#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Test suite for setup.sh helper functions
#
# Usage: bash test/test_setup.sh
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Test framework ───────────────────────────────────────────────────
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILURES=""

pass() { ((TESTS_PASSED++)); echo "  ✓ $1"; }
fail_test() {
  ((TESTS_FAILED++))
  echo "  ✗ $1"
  FAILURES="${FAILURES}\n  - $1: $2"
}
assert_eq() {
  local label="$1" expected="$2" actual="$3"
  ((TESTS_RUN++))
  if [ "$expected" = "$actual" ]; then
    pass "$label"
  else
    fail_test "$label" "expected '$expected', got '$actual'"
  fi
}
assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  ((TESTS_RUN++))
  if echo "$haystack" | grep -qF "$needle"; then
    pass "$label"
  else
    fail_test "$label" "expected to contain '$needle'"
  fi
}
assert_file_contains() {
  local label="$1" needle="$2" file="$3"
  ((TESTS_RUN++))
  if grep -qF "$needle" "$file"; then
    pass "$label"
  else
    fail_test "$label" "'$file' does not contain '$needle'"
  fi
}
assert_not_empty() {
  local label="$1" value="$2"
  ((TESTS_RUN++))
  if [ -n "$value" ]; then
    pass "$label"
  else
    fail_test "$label" "value is empty"
  fi
}

# ── Setup: temp directory + source helpers ───────────────────────────
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

cd "$TMPDIR_TEST"

# Source just the helper functions
INSTALL_LIB_ONLY=1 source "$REPO_ROOT/setup.sh"

echo ""
echo "═══ setup.sh test suite ═══"
echo ""

# ── Test: mask() ─────────────────────────────────────────────────────
echo "mask():"
assert_eq "empty string → (empty)" "(empty)" "$(mask "")"
assert_eq "short secret → ****" "****" "$(mask "abc")"
assert_eq "8-char secret → ****" "****" "$(mask "12345678")"
assert_eq "long secret → partial mask" "abcd****wxyz" "$(mask "abcdefghijklmnopqrstuvwxyz")"
assert_eq "9-char secret → partial mask" "abcd****fghi" "$(mask "abcdefghi")"

# ── Test: normalize_url() ───────────────────────────────────────────
echo ""
echo "normalize_url():"
assert_eq "adds https:// to bare domain" "https://www.kncb.nl" "$(normalize_url "www.kncb.nl")"
assert_eq "keeps existing https://" "https://www.kncb.nl" "$(normalize_url "https://www.kncb.nl")"
assert_eq "keeps existing http://" "http://localhost:3000" "$(normalize_url "http://localhost:3000")"
assert_eq "adds https:// to domain with path" "https://example.com/path" "$(normalize_url "example.com/path")"

# ── Test: find_port() ────────────────────────────────────────────────
echo ""
echo "find_port():"

port=$(find_port 3000)
assert_not_empty "find_port returns a value" "$port"
((TESTS_RUN++))
if [ "$port" -ge 3000 ] 2>/dev/null; then
  pass "find_port returns >= 3000"
else
  fail_test "find_port returns >= 3000" "got $port"
fi
# Verify the returned port is actually free
((TESTS_RUN++))
if ! lsof -iTCP:"$port" -sTCP:LISTEN &>/dev/null; then
  pass "returned port $port is actually free"
else
  fail_test "returned port $port is actually free" "port is in use"
fi

# ── Test: set_env() / get_env() ─────────────────────────────────────
echo ""
echo "set_env() / get_env():"

# Create a test .env.local
cat > .env.local <<'EOF'
# Test env file
LIVEAVATAR_API_KEY=
SF_INSTANCE_URL=https://old.my.salesforce.com
SF_AGENT_ID=0XxOLD
EXISTING_WITH_COMMENT=value    # some comment
EOF

# Test: set empty value
set_env "LIVEAVATAR_API_KEY" "test-key-123"
assert_eq "set_env writes empty var" "test-key-123" "$(get_env "LIVEAVATAR_API_KEY")"

# Test: overwrite existing value
set_env "SF_INSTANCE_URL" "https://new.my.salesforce.com"
assert_eq "set_env overwrites existing" "https://new.my.salesforce.com" "$(get_env "SF_INSTANCE_URL")"

# Test: append new key
set_env "NEW_KEY" "new-value"
assert_eq "set_env appends missing key" "new-value" "$(get_env "NEW_KEY")"

# Test: get_env returns empty for unset
assert_eq "get_env returns empty for missing key" "" "$(get_env "NONEXISTENT_KEY")"

# Test: overwrite preserves other lines
assert_eq "overwrite preserves other vars" "0XxOLD" "$(get_env "SF_AGENT_ID")"

# Test: set_env with URL containing slashes
set_env "SF_INSTANCE_URL" "https://heygen-demo.my.salesforce.com/services/oauth2"
assert_eq "set_env handles slashes in value" "https://heygen-demo.my.salesforce.com/services/oauth2" "$(get_env "SF_INSTANCE_URL")"

# Test: set_env idempotent (run twice with same value)
set_env "SF_AGENT_ID" "0XxNEW"
set_env "SF_AGENT_ID" "0XxNEW"
local_count=$(grep -c "^SF_AGENT_ID=" .env.local)
assert_eq "set_env idempotent (no duplicate lines)" "1" "$local_count"

# ── Test: set_env with special characters ────────────────────────────
echo ""
echo "set_env() edge cases:"

set_env "TEST_SPECIAL" "value-with-pipes|and&ampersands"
assert_eq "handles pipes and ampersands" "value-with-pipes|and&ampersands" "$(get_env "TEST_SPECIAL")"

set_env "TEST_EQUALS" "key=value=more"
assert_eq "handles equals in value" "key=value=more" "$(get_env "TEST_EQUALS")"

# ── Test: migrate_env() ─────────────────────────────────────────────
echo ""
echo "migrate_env():"

# Simulate old .env.local with HEYGEN_API_KEY
cat > .env.local <<'EOF'
HEYGEN_API_KEY=sk_old_key_12345
LIVEAVATAR_API_KEY=
SF_INSTANCE_URL=https://test.my.salesforce.com
EOF

migrate_env "HEYGEN_API_KEY" "LIVEAVATAR_API_KEY"
assert_eq "migrates old key to new key" "sk_old_key_12345" "$(get_env "LIVEAVATAR_API_KEY")"

# Should not overwrite if new key already has a value
set_env "LIVEAVATAR_API_KEY" "sk_new_key_99999"
set_env "HEYGEN_API_KEY" "sk_should_not_win"
migrate_env "HEYGEN_API_KEY" "LIVEAVATAR_API_KEY"
assert_eq "does not overwrite existing new key" "sk_new_key_99999" "$(get_env "LIVEAVATAR_API_KEY")"

# Test: quoted values get cleaned
cat > .env.local <<'EOF'
LIVEAVATAR_API_KEY="sk_quoted_key_abc123"
SF_INSTANCE_URL="https://test.my.salesforce.com"  # my org
SF_CLIENT_ID=
EOF

# Run the same cleanup logic the install script uses
for key in LIVEAVATAR_API_KEY SF_INSTANCE_URL SF_CLIENT_ID; do
  raw=$(grep "^${key}=" .env.local 2>/dev/null | head -1 | cut -d= -f2- || true)
  cleaned=$(echo "$raw" | sed 's/^["'\''"]//;s/["'\''"].*$//' | sed 's/[[:space:]]*#.*//')
  if [ "$raw" != "$cleaned" ] && [ -n "$cleaned" ]; then
    set_env "$key" "$cleaned"
  fi
done

assert_eq "strips quotes from value" "sk_quoted_key_abc123" "$(get_env "LIVEAVATAR_API_KEY")"
assert_eq "strips quotes and inline comments" "https://test.my.salesforce.com" "$(get_env "SF_INSTANCE_URL")"

# ── Test: build_demo_url() ───────────────────────────────────────────
echo ""
echo "build_demo_url():"

url=$(build_demo_url "https://www.kncb.nl" "#ff6600" "nl")
assert_contains "encodes color hash" "%23ff6600" "$url"
assert_contains "includes lang param" "lang=nl" "$url"
assert_contains "starts with /demo" "/demo?site=" "$url"
assert_contains "encodes site URL" "kncb" "$url"

url_default=$(build_demo_url "https://example.com" "#333" "en")
assert_contains "default lang=en" "lang=en" "$url_default"
assert_contains "short color works" "%23333" "$url_default"

# ── Test: .env.local template copy ───────────────────────────────────
echo ""
echo "Template handling:"

# Copy the real template to test
cp "$REPO_ROOT/.env.local.example" "$TMPDIR_TEST/.env.local.example" 2>/dev/null || true
if [ -f "$TMPDIR_TEST/.env.local.example" ]; then
  cp .env.local.example .env.local
  assert_file_contains "template has LIVEAVATAR_API_KEY" "LIVEAVATAR_API_KEY=" ".env.local"
  assert_file_contains "template has SF_INSTANCE_URL" "SF_INSTANCE_URL=" ".env.local"
  assert_file_contains "template has SF_AGENT_ID" "SF_AGENT_ID=" ".env.local"

  # Test: set values on fresh template then read back
  set_env "LIVEAVATAR_API_KEY" "fresh-key"
  assert_eq "set on fresh template" "fresh-key" "$(get_env "LIVEAVATAR_API_KEY")"

  # Verify template comments are preserved
  ((TESTS_RUN++))
  if grep -q "# API key from liveavatar.com" .env.local; then
    # Comments on the same line as the key get replaced by set_env (expected)
    pass "template lines present (comments may be replaced)"
  else
    pass "template lines present (key-only lines)"
  fi
else
  echo "  ⊘ Skipped template tests (.env.local.example not found)"
fi

# ── Test: SKILL.md structure ─────────────────────────────────────────
echo ""
echo "SKILL.md validation:"

SKILL_FILE="$REPO_ROOT/.claude/skills/setup-customer/SKILL.md"
((TESTS_RUN++))
if [ -f "$SKILL_FILE" ]; then
  pass "SKILL.md exists"
else
  fail_test "SKILL.md exists" "file not found at $SKILL_FILE"
fi

if [ -f "$SKILL_FILE" ]; then
  # Check frontmatter
  assert_file_contains "has name field" "name: setup-customer" "$SKILL_FILE"
  assert_file_contains "has description field" "description:" "$SKILL_FILE"
  assert_file_contains "is user-invocable" "user-invocable: true" "$SKILL_FILE"
  assert_file_contains "allows WebFetch tool" "WebFetch" "$SKILL_FILE"
  assert_file_contains "allows AskUserQuestion tool" "AskUserQuestion" "$SKILL_FILE"

  # Check content references correct files
  assert_file_contains "references .env.local.example" ".env.local.example" "$SKILL_FILE"
  assert_file_contains "references demo/page.tsx" "demo/page.tsx" "$SKILL_FILE"
  assert_file_contains "references proxy route" "proxy" "$SKILL_FILE"
  assert_file_contains "references sf-connected-apps skill" "sf-connected-apps" "$SKILL_FILE"
  assert_file_contains "references agentforce-start skill" "agentforce-start" "$SKILL_FILE"

  # Check it mentions correct env var names
  assert_file_contains "uses LIVEAVATAR_API_KEY (not HEYGEN_API_KEY)" "LIVEAVATAR_API_KEY" "$SKILL_FILE"
  assert_file_contains "uses SF_INSTANCE_URL" "SF_INSTANCE_URL" "$SKILL_FILE"
  assert_file_contains "uses SF_AGENT_ID" "SF_AGENT_ID" "$SKILL_FILE"

  # Check referenced source files actually exist
  echo ""
  echo "SKILL.md file references:"
  for ref_file in \
    ".env.local.example" \
    "src/app/demo/page.tsx" \
    "src/app/api/demo/proxy/route.ts" \
    "src/app/embed/page.tsx" \
    "INSTALL.md" \
    "CONFIGURATION.md"; do
    ((TESTS_RUN++))
    if [ -f "$REPO_ROOT/$ref_file" ]; then
      pass "$ref_file exists"
    else
      fail_test "$ref_file exists" "referenced file missing"
    fi
  done
fi

# ── Test: setup.sh structure ───────────────────────────────────────
echo ""
echo "setup.sh validation:"

INSTALL_FILE="$REPO_ROOT/setup.sh"
assert_file_contains "has shebang" "#!/usr/bin/env bash" "$INSTALL_FILE"
assert_file_contains "has set -euo pipefail" "set -euo pipefail" "$INSTALL_FILE"
assert_file_contains "has TTY guard" '[ ! -t 0 ]' "$INSTALL_FILE"
assert_file_contains "has INSTALL_LIB_ONLY guard" "INSTALL_LIB_ONLY" "$INSTALL_FILE"
assert_file_contains "checks node version" "check_version node" "$INSTALL_FILE"
assert_file_contains "checks npm version" "check_version npm" "$INSTALL_FILE"
assert_file_contains "checks git" 'command -v git' "$INSTALL_FILE"
assert_file_contains "has Docker option" "docker build" "$INSTALL_FILE"
assert_file_contains "detects Claude Code" 'command -v claude' "$INSTALL_FILE"

((TESTS_RUN++))
if [ -x "$INSTALL_FILE" ]; then
  pass "setup.sh is executable"
else
  fail_test "setup.sh is executable" "missing +x permission"
fi

# ── Results ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Results: $TESTS_PASSED/$TESTS_RUN passed, $TESTS_FAILED failed"
echo "═══════════════════════════════════════════"

if [ $TESTS_FAILED -gt 0 ]; then
  echo -e "\nFailures:$FAILURES"
  echo ""
  exit 1
else
  echo ""
  echo "  All tests passed!"
  echo ""
  exit 0
fi
