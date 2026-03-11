---
name: setup-customer
description: Set up the LiveAvatar + Agentforce app for a customer demo. Configures credentials, auto-detects branding from customer website, generates demo proxy URL, and adds quick links. Use this whenever someone says "set up for customer", "new demo", "configure for [company]", or wants to prepare a customer-specific demo experience.
user-invocable: true
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, WebFetch, AskUserQuestion]
---

# /setup-customer — Customer Demo Setup

You are helping set up the LiveAvatar + Agentforce app for a specific customer demo. The app proxies the customer's website and overlays an AI avatar chat widget — no custom code per customer needed.

## How it works

The demo proxy (`/demo?site=<url>&color=<hex>&lang=<code>`) fetches the customer site server-side, strips CSP headers, and injects a floating chat button + expandable panel containing the LiveAvatar embed. The customer sees their real website with an AI assistant overlaid.

## Step 0: Assess Current State

Before asking any questions, check what's already configured:

1. Read `package.json` — verify we're in the liveavatar-app directory
2. Check `node_modules/` exists — if not, tell user to run `npm install`
3. Check `.env.local` exists — if not, copy from `.env.local.example`
4. Parse `.env.local` to identify which required vars are set vs empty:
   - **HeyGen**: `LIVEAVATAR_API_KEY`, `LIVEAVATAR_AVATAR_ID`, `LIVEAVATAR_VOICE_ID`
   - **Salesforce**: `SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_AGENT_ID`
5. Check `src/app/demo/page.tsx` for existing quick links (the array around line 187)

Present a concise summary:
```
Current state:
  Dependencies: ✓ installed
  .env.local: ✓ exists
  HeyGen credentials: ✗ missing (API key, avatar ID, voice ID)
  Salesforce credentials: ✓ configured
  Existing quick links: Wikipedia, Tesla
```

## Step 1: Customer Identity

Ask the user:
- **Customer name** (e.g., "KNCB")
- **Customer website URL** (e.g., "https://www.kncb.nl")

Once you have the URL, fetch the site using WebFetch to extract:
- Primary brand color (from header, nav, buttons, or prominent UI elements)
- Logo URL (from `<img>` in header, `og:image`, or favicon)
- A brief description of the site for context

Present what you found and let the user confirm or override the brand color:
```
Detected from kncb.nl:
  Brand color: #ff6600 (orange — from header/nav elements)
  Logo: https://dvy7d3tlxdpkf.cloudfront.net/kncb/images/logos/logo-kncb.png
  Description: Royal Dutch Cricket Board

Use #ff6600 as brand color? (or enter a different hex)
```

## Step 2: Configure Missing Credentials

Only prompt for credentials that are empty in `.env.local`. Skip sections where values are already set.

### HeyGen LiveAvatar (if missing)

Ask for each missing value:
- `LIVEAVATAR_API_KEY` — from https://liveavatar.com
- `LIVEAVATAR_AVATAR_ID` — from LiveAvatar dashboard (or browse later via /admin)
- `LIVEAVATAR_VOICE_ID` — from LiveAvatar dashboard (or browse later via /admin)

Mention: "You can browse available avatars and voices at /admin after the app is running."

### Salesforce Agentforce (if missing)

For Salesforce setup, guide the user to the specialized skills:

1. **Connected App** — tell the user:
   > You need a Salesforce Connected App with OAuth 2.0 Client Credentials flow.
   > Run `/sf-connected-apps` for guided setup, or see INSTALL.md for manual steps.
   > Required scopes: `api`, `cdp_api`. Must have a "Run As" user assigned.

   After they complete it, ask for: `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_INSTANCE_URL`

2. **Agentforce Agent** — tell the user:
   > You need an Agentforce agent configured in your org.
   > Run `/agentforce-start` or `/sf-ai-agentforce` for guided setup.
   > Note: this app passes `channel: voice_api` as a context variable so the
   > agent returns text-only responses (no rich text/links for voice).

   After they complete it, ask for: `SF_AGENT_ID`

Write each value to `.env.local` as soon as you receive it using the Edit tool. Match the format in `.env.local.example` — replace the line `KEY=.*` with `KEY=value`.

### Language

Ask what language the demo should use. Default is `en`. Set `LIVEAVATAR_LANGUAGE` in `.env.local`.

## Step 3: Generate Demo URL

Build the proxy demo URL from the gathered info:

```
/demo?site=<url-encoded-customer-url>&color=<url-encoded-color>&lang=<language>
```

Color encoding: `#ff6600` → `%23ff6600`

Present the full localhost URL:
```
Your demo URL:
  http://localhost:3000/demo?site=https%3A%2F%2Fwww.kncb.nl&color=%23ff6600&lang=nl
```

## Step 4: Add Quick Link (optional)

Ask if the user wants to add this customer as a quick link on the `/demo` page. If yes, edit `src/app/demo/page.tsx` — add an entry to the quick links array (around line 187-189):

```tsx
{ label: 'KNCB', url: 'https://www.kncb.nl', color: '#ff6600' },
```

Add it after the existing entries, before the closing `]`.

## Step 5: Optional Config

Ask if they want to configure:
- **Admin password** (`ADMIN_PASSWORD`) — protects the `/admin` panel where you can browse avatars/voices and edit config
- **API secret** (`API_SECRET`) — locks down all API routes with a Bearer token

## Step 6: Start

Ask what to do:
1. `npm run dev` — start development server at localhost:3000
2. `docker build -t liveavatar . && docker run -p 3000:3000 --env-file .env.local liveavatar` — Docker
3. Just show the summary (don't start)

If starting, run the command. Then tell the user:
```
App is running at http://localhost:3000

Demo URL (proxy with widget):
  http://localhost:3000/demo?site=...&color=...&lang=...

Direct URL (standalone, no proxy):
  http://localhost:3000/?lang=nl

Admin panel:
  http://localhost:3000/admin
```

## Step 7: Summary

Present a final summary:
```
Setup complete for KNCB

Credentials:
  HeyGen API Key:    abc1****ef90
  Avatar ID:         josh_lite3_20230714
  SF Instance:       https://heygen-demo.my.salesforce.com
  SF Agent ID:       0XxHn000000oNEaKAM

Demo:
  Proxy URL:  http://localhost:3000/demo?site=...&color=%23ff6600&lang=nl
  Direct URL: http://localhost:3000/?lang=nl
  Admin:      http://localhost:3000/admin

Quick link added to /demo page: ✓
```

## Key files reference

| File | Purpose |
|------|---------|
| `.env.local.example` | Template — all env vars with comments |
| `.env.local` | Actual config (git-ignored) |
| `src/app/demo/page.tsx` | Demo page with quick links (line ~187) |
| `src/app/api/demo/proxy/route.ts` | Proxy that fetches site + injects widget |
| `src/app/embed/page.tsx` | Embedded chat widget (loaded in proxy iframe) |
| `INSTALL.md` | Detailed installation guide |
| `CONFIGURATION.md` | All environment variables documented |

## Tone

Be concise and practical. This is a presales tool — the user wants to get a demo running quickly, not learn the architecture. Skip sections where everything is already configured. If all credentials are set, jump straight to generating the demo URL.
