# Configuration Guide

Complete reference for all environment variables and how they flow through the app.

## How It Works

```
User speaks → HeyGen STT → /api/agent (Agentforce) → avatar.speak()
                                                         ↓
                                              FULL mode: HeyGen TTS
                                              CUSTOM mode: /api/tts → avatar.repeatAudio()
```

**Connection setup (happens once per session):**

1. `POST /api/liveavatar/token` → Creates HeyGen session using `LIVEAVATAR_*` vars
2. `POST /api/agent/session` → Creates Agentforce session using `SF_*` vars
3. HeyGen SDK opens WebRTC connection using the session token

**Per-message flow:**

1. HeyGen SDK transcribes user speech (built-in Deepgram STT)
2. Transcription sent to `POST /api/agent` → Salesforce Agentforce → response text
3. Response spoken by avatar:
   - **FULL mode:** `session.repeat(text)` — HeyGen handles TTS internally
   - **CUSTOM mode:** `POST /api/tts` → PCM audio → `session.repeatAudio(base64)`

---

## Required Variables

### `LIVEAVATAR_API_KEY`

API key from [liveavatar.com](https://liveavatar.com).

- **Used in:** `POST https://api.liveavatar.com/v1/sessions/token` as `X-API-KEY` header
- **Without it:** Connect button fails immediately with "LIVEAVATAR_API_KEY not configured"

### `LIVEAVATAR_AVATAR_ID`

Avatar character ID from the LiveAvatar dashboard. Browse available avatars at `/admin` → Avatars tab.

- **Used in:** Request body to HeyGen: `{ avatar_id: "..." }`
- **Without it:** Session token creation fails
- **Tip:** Each avatar has a default voice pairing (e.g., "Judy Doctor Standing" pairs with "Judy - Professional"). The admin panel shows this pairing and auto-selects the voice when you pick an avatar.

### `LIVEAVATAR_VOICE_ID`

Voice ID for the avatar. Browse available voices at `/admin` → Avatars tab (shown as "Voice: ..." under each avatar).

- **Used in:** Request body: `{ avatar_persona: { voice_id: "..." } }`
- **Without it:** HeyGen uses the avatar's default voice
- **Important:** Match the voice gender to the avatar to avoid mismatches (e.g., don't assign a male voice to a female avatar)

### `SF_INSTANCE_URL`

Your Salesforce org URL, e.g., `https://your-org.my.salesforce.com`

- **Used in:** OAuth token endpoint: `POST ${SF_INSTANCE_URL}/services/oauth2/token`
- **OAuth flow:** Client Credentials grant (`grant_type=client_credentials`)
- **Token caching:** Access token cached for 25 minutes (tokens are valid for 30 min)
- **Without it:** All Agentforce calls fail

### `SF_CLIENT_ID`

Connected App Consumer Key from your Salesforce org.

- **Used in:** OAuth request body: `client_id=${SF_CLIENT_ID}`
- **Setup:** Create a Connected App in Salesforce → Enable OAuth 2.0 → Client Credentials flow

### `SF_CLIENT_SECRET`

Connected App Consumer Secret.

- **Used in:** OAuth request body: `client_secret=${SF_CLIENT_SECRET}`

### `SF_AGENT_ID`

Agentforce Agent ID from the Agentforce setup page.

- **Used in:** Agent API: `POST https://api.salesforce.com/einstein/ai-agent/v1/agents/${SF_AGENT_ID}/sessions`
- **Context variable:** Sessions are created with `{ name: 'channel', type: 'Text', value: 'voice_api' }` so the agent knows to return text-only responses (no rich formatting)
- **Message polling:** After sending a message, the app polls every 1 second until status is `Completed` (max 120 seconds)

---

## Optional Variables

### `LIVEAVATAR_MODE`

Controls how the avatar speaks responses.

| Value | TTS Provider | Avatar Speech Call | Context ID | Use Case |
|-------|-------------|-------------------|------------|----------|
| `full` (default) | HeyGen built-in | `session.repeat(text)` | Sent if set | Simpler setup, lower latency |
| `custom` | OpenAI or ElevenLabs | `session.repeatAudio(base64)` | Not sent | More control over voice, multilingual TTS |

**FULL mode details:**
- HeyGen handles text-to-speech internally
- If `LIVEAVATAR_CONTEXT_ID` is set, HeyGen's built-in AI also activates — the app calls `session.interrupt()` before sending the Agentforce response to stop any built-in AI response
- Latency timeline shows 3 segments: STT → Agent → Avatar

**CUSTOM mode details:**
- App calls `/api/tts` to generate PCM audio via OpenAI or ElevenLabs
- Audio sent to avatar as base64 via `session.repeatAudio()`
- Requires `OPENAI_API_KEY` or `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`
- Latency timeline shows 4 segments: STT → Agent → TTS → Avatar

### `LIVEAVATAR_LANGUAGE`

Language code for the avatar's speech synthesis. Default: `en`

- **Used in:** Request body: `{ avatar_persona: { language: "fr" } }`
- **Supported values:** `en`, `nl`, `fr`, `de`, `es`, and other language codes supported by HeyGen
- **Note:** This controls the avatar's TTS language. For the full experience to be in another language, the Agentforce agent must also be configured to respond in that language.

### `LIVEAVATAR_CONTEXT_ID`

HeyGen context ID for avatar personality/knowledge. Browse available contexts at `/admin` → Contexts tab.

- **Used in:** Request body (FULL mode only): `{ avatar_persona: { context_id: "..." } }`
- **FULL mode:** Enables HeyGen's built-in AI with this knowledge base. The app interrupts the built-in AI response and replaces it with the Agentforce response.
- **CUSTOM mode:** Not sent to HeyGen (ignored)

### `LIVEAVATAR_API_URL`

Override the HeyGen API base URL. Default: `https://api.liveavatar.com`

- **Used in:** `POST ${LIVEAVATAR_API_URL}/v1/sessions/token` and `DELETE ${LIVEAVATAR_API_URL}/v1/sessions`
- **Use case:** Testing against a staging HeyGen environment

### `TTS_PROVIDER`

Which TTS service to use in CUSTOM mode. Default: `openai`

| Value | Service | Required Env Vars | Model | Audio Format |
|-------|---------|------------------|-------|-------------|
| `openai` | OpenAI TTS | `OPENAI_API_KEY` | `tts-1` | PCM 24kHz 16-bit mono |
| `elevenlabs` | ElevenLabs | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | `eleven_multilingual_v2` | PCM 24kHz |

- **Ignored in FULL mode** (HeyGen handles TTS)

### `OPENAI_API_KEY`

OpenAI API key for text-to-speech.

- **Used in:** `POST https://api.openai.com/v1/audio/speech` with `Authorization: Bearer ${OPENAI_API_KEY}`
- **Request body:** `{ model: 'tts-1', input: text, voice: 'alloy', response_format: 'pcm' }`
- **Available voices:** `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
- **Required when:** `LIVEAVATAR_MODE=custom` and `TTS_PROVIDER=openai` (or TTS_PROVIDER not set)

### `ELEVENLABS_API_KEY`

ElevenLabs API key.

- **Used in:** `POST https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}` with `xi-api-key` header
- **Required when:** `TTS_PROVIDER=elevenlabs`

### `ELEVENLABS_VOICE_ID`

ElevenLabs voice ID.

- **Used in:** URL path of ElevenLabs TTS endpoint
- **Required when:** `TTS_PROVIDER=elevenlabs`

---

## Security & Admin Variables

### `ADMIN_PASSWORD`

Password for the `/admin` panel. Leave empty to disable admin access entirely.

- **Authentication flow:**
  1. User enters password at `/admin`
  2. `POST /api/admin/auth` → timing-safe password comparison → HMAC-SHA256 token generated
  3. Token set as `admin_token` httpOnly cookie (secure in production, 15 min expiry, path `/api/admin`)
  4. All `/api/admin/*` routes verify this cookie
- **Token format:** `${base64url(payload)}.${hmac_signature}` — payload contains `iat` and `exp`
- **Without it:** All admin endpoints return 500 "ADMIN_PASSWORD not configured"

### `API_SECRET`

Optional API key to lock down all non-admin API routes.

- **When set:** All requests to `/api/*` (except `/api/admin/*`) must include:
  - `Authorization: Bearer ${API_SECRET}` header, OR
  - `X-API-Key: ${API_SECRET}` header
- **When not set:** API routes are open (protected only by rate limiting)
- **Rate limits** (always active, per IP):

| Route | Limit |
|-------|-------|
| `/api/admin/auth` | 5 requests/minute |
| `/api/demo/proxy` | 30 requests/minute |
| `/api/agent` | 60 requests/minute |
| `/api/tts` | 60 requests/minute |
| `/api/liveavatar/token` | 60 requests/minute |
| All other routes | 120 requests/minute |

### `HEROKU_API_KEY`

Heroku Platform API token. Enables editing environment variables from the `/admin` web UI.

- **Used in:** `GET/PATCH https://api.heroku.com/apps/${HEROKU_APP_NAME}/config-vars` with `Authorization: Bearer ${HEROKU_API_KEY}`
- **Both `HEROKU_API_KEY` and `HEROKU_APP_NAME` must be set** to enable read-write config mode
- **Without them:** Admin config tab is read-only (shows current values but can't edit)

### `HEROKU_APP_NAME`

Heroku app name (e.g., `liveavatar-agentforce-app`).

- **Used in:** Heroku API URL path
- **Required if:** `HEROKU_API_KEY` is set

---

## UI & Branding Variables

### `NEXT_PUBLIC_DEFAULT_SITE`

Default custom header component. Overridable via `?site=` URL parameter.

- **Values:** Component name (e.g., `mycustomer`) or empty for generic header
- **Generic header** uses URL parameters for branding (`?logo=`, `?color=`, etc.)
- **Custom headers** are React components in `src/components/` registered in `SiteHeader.tsx`

### `NEXT_PUBLIC_DEFAULT_LANG`

Default UI language. Overridable via `?lang=` URL parameter.

- **Values:** Language code (`en`, `nl`, `fr`, etc.)
- **Used in:** `src/app/page.tsx` and `src/app/embed/page.tsx` → `getTranslations(lang)`
- **Priority:** `?lang=` URL param > `NEXT_PUBLIC_DEFAULT_LANG` > English fallback

### `NEXT_PUBLIC_APP_URL`

App's public URL for server-side rendering fallback. Default: `http://localhost:3000`

- **Used in:** Demo page (`/demo`) for generating Tampermonkey userscripts
- **Browser overrides this:** Client-side code uses `window.location.origin` instead
- **Only matters for:** SSR of the demo page

---

## URL Parameters (Not Env Vars)

These are passed as query parameters in the URL, not environment variables. They allow per-customer branding without code changes:

| Parameter | Description | Example | Sanitization |
|-----------|-------------|---------|-------------|
| `site` | Custom header component | `mycustomer` | — |
| `logo` | Customer logo URL | `https://cdn.brandfetch.io/.../logo.png` | `sanitizeUrl()` — must be `http://` or `https://` |
| `logoAlt` | Logo alt text | `Acme Corp` | — |
| `homeUrl` | Logo click target | `https://www.acme.com` | `sanitizeUrl()` — blocks `javascript:` URLs |
| `color` | Brand accent color | `%23ff5000` (URL-encoded `#ff5000`) | `sanitizeColor()` — must match `/^#[0-9a-fA-F]{3,8}$/` |
| `lang` | UI language | `nl` | — |

**Example branded URL:**
```
https://your-app.com/?logo=https://cdn.brandfetch.io/example/logo.png&color=%23ff5000&homeUrl=https://www.example.com&logoAlt=Example
```

Find customer logos at [brandfetch.com](https://brandfetch.com/).

---

## Configuration Modes Summary

| Deployment | Config Editing | How to Update |
|-----------|---------------|---------------|
| **Local (`npm run dev`)** | Read-only in admin UI | Edit `.env.local`, restart dev server |
| **Docker** | Read-only in admin UI | Edit `.env.local` (no quotes, no inline comments), rebuild/restart container |
| **Heroku (without API key)** | Read-only in admin UI | `heroku config:set KEY=value -a app-name` |
| **Heroku (with API key)** | **Editable in admin UI** | Edit in browser at `/admin`, auto-restarts dyno |
| **AWS / other cloud** | Read-only in admin UI | Update via platform CLI/dashboard, redeploy |

To enable browser-based config editing on Heroku:
```bash
heroku config:set ADMIN_PASSWORD=your-password -a your-app-name
heroku config:set HEROKU_API_KEY=$(heroku auth:token) -a your-app-name
heroku config:set HEROKU_APP_NAME=your-app-name -a your-app-name
```

---

## Typical Configurations

### Minimal (FULL mode, English)

```bash
LIVEAVATAR_API_KEY=your-heygen-key
LIVEAVATAR_AVATAR_ID=65f9e3c9-...
LIVEAVATAR_VOICE_ID=4f3b1e99-...
SF_INSTANCE_URL=https://your-org.my.salesforce.com
SF_CLIENT_ID=your-client-id
SF_CLIENT_SECRET=your-client-secret
SF_AGENT_ID=your-agent-id
```

### FULL mode with HeyGen context + French

```bash
LIVEAVATAR_API_KEY=your-heygen-key
LIVEAVATAR_AVATAR_ID=65f9e3c9-...
LIVEAVATAR_VOICE_ID=4f3b1e99-...
LIVEAVATAR_CONTEXT_ID=36f23418-...
LIVEAVATAR_LANGUAGE=fr
SF_INSTANCE_URL=https://your-org.my.salesforce.com
SF_CLIENT_ID=your-client-id
SF_CLIENT_SECRET=your-client-secret
SF_AGENT_ID=your-agent-id
```

### CUSTOM mode with ElevenLabs TTS

```bash
LIVEAVATAR_API_KEY=your-heygen-key
LIVEAVATAR_AVATAR_ID=65f9e3c9-...
LIVEAVATAR_VOICE_ID=4f3b1e99-...
LIVEAVATAR_MODE=custom
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_VOICE_ID=your-voice-id
SF_INSTANCE_URL=https://your-org.my.salesforce.com
SF_CLIENT_ID=your-client-id
SF_CLIENT_SECRET=your-client-secret
SF_AGENT_ID=your-agent-id
```

### Production with admin + API security

```bash
# ... all the above, plus:
ADMIN_PASSWORD=strong-password-here
API_SECRET=random-api-key-here
```
