# Solution Design: How It Works

## Overview

The app connects three external services into a voice conversation loop:

1. **HeyGen LiveAvatar** — Renders a photorealistic talking avatar via WebRTC, handles speech-to-text (Deepgram), and text-to-speech (in FULL mode)
2. **Salesforce Agentforce** — AI backend that processes user messages and generates responses
3. **OpenAI / ElevenLabs** (CUSTOM mode only) — External text-to-speech providers

The user speaks to the avatar, the avatar transcribes their speech, the transcription is sent to Agentforce, and the response is spoken back by the avatar.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           BROWSER                                    │
│                                                                      │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────────┐   │
│  │  SiteHeader  │    │ LiveAvatarSession │    │  Conversation UI  │   │
│  │  (branding)  │    │  (SDK wrapper)    │    │  (messages list)  │   │
│  └─────────────┘    └────────┬─────────┘    └───────────────────┘   │
│                              │                                       │
│                    WebRTC    │   REST API calls                      │
│                   (video +   │   (fetch)                             │
│                    audio)    │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │       NEXT.JS SERVER         │
                │                              │
                │  /api/liveavatar/token   ─────────── HeyGen API
                │  /api/liveavatar/session ─────────── (api.liveavatar.com)
                │                              │
                │  /api/agent             ─────────── Salesforce Agentforce
                │  /api/agent/session      ─────────── (api.salesforce.com)
                │                              │
                │  /api/tts               ─────────── OpenAI / ElevenLabs
                │  (CUSTOM mode only)          │
                │                              │
                │  /api/admin/*           ─────────── Heroku Platform API
                │  /api/demo/proxy        ─────────── Customer websites
                └──────────────────────────────┘
```

---

## Connection Sequence

When the user clicks "Connect", three things happen in sequence:

```
User clicks "Connect"
│
├── 1. Request microphone permission
│       navigator.mediaDevices.getUserMedia({ audio: true })
│       └── If denied → error: "Microphone permission required"
│
├── 2. Create HeyGen session token
│       POST /api/liveavatar/token
│       │
│       └── Server calls HeyGen API:
│           POST https://api.liveavatar.com/v1/sessions/token
│           Headers: { X-API-KEY: LIVEAVATAR_API_KEY }
│           Body: {
│             mode: "FULL" or "CUSTOM",
│             avatar_id: LIVEAVATAR_AVATAR_ID,
│             avatar_persona: {
│               voice_id: LIVEAVATAR_VOICE_ID,
│               language: LIVEAVATAR_LANGUAGE,     // e.g., "en", "fr"
│               context_id: LIVEAVATAR_CONTEXT_ID  // FULL mode only
│             }
│           }
│           └── Returns: { session_token, session_id }
│
├── 3. Create Agentforce session
│       POST /api/agent/session
│       │
│       ├── Server authenticates via OAuth 2.0 Client Credentials:
│       │   POST ${SF_INSTANCE_URL}/services/oauth2/token
│       │   Body: grant_type=client_credentials
│       │         &client_id=${SF_CLIENT_ID}
│       │         &client_secret=${SF_CLIENT_SECRET}
│       │   └── Returns: { access_token } (cached for 25 min)
│       │
│       └── Server creates agent session:
│           POST https://api.salesforce.com/einstein/ai-agent/v1
│                /agents/${SF_AGENT_ID}/sessions
│           Headers: { Authorization: Bearer ${access_token} }
│           Body: {
│             externalSessionKey: <random UUID>,
│             instanceConfig: { endpoint: SF_INSTANCE_URL },
│             bypassUser: false,
│             variables: [
│               { name: "channel", type: "Text", value: "voice_api" }
│             ]
│           }
│           └── Returns: { sessionId }
│
└── 4. Initialize HeyGen SDK
        new Session(session_token, { voiceChat: true })
        │
        ├── SESSION_STREAM_READY event
        │   └── session.attach(videoElement)  // WebRTC video starts
        │
        └── User clicks "Start Voice Chat"
            └── session.voiceChat.start()    // Microphone listening begins
```

---

## Conversation Loop

Once connected, every user utterance follows this path:

```
┌─────────────────────────────────────────────────────────────┐
│  1. USER SPEAKS                                              │
│     HeyGen SDK detects voice activity (VAD)                  │
│     → USER_SPEAK_STARTED event                               │
│     → UI shows "Listening..." indicator                      │
└──────────────────────────┬──────────────────────────────────┘
                           │ User stops speaking
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. SPEECH-TO-TEXT (HeyGen, powered by Deepgram)             │
│     → USER_SPEAK_ENDED event                                 │
│     → Audio sent to Deepgram for transcription               │
│     → USER_TRANSCRIPTION event with { text: "..." }          │
│                                                              │
│     FULL mode only: session.interrupt() called here          │
│     (cancels any built-in HeyGen AI response)                │
└──────────────────────────┬──────────────────────────────────┘
                           │ Transcribed text
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. AGENTFORCE (Salesforce)                                  │
│     Client sends: POST /api/agent                            │
│     Body: { message: "transcribed text", sessionId: "..." }  │
│                                                              │
│     Server sends to Salesforce:                              │
│     POST .../sessions/${sessionId}/messages                  │
│     Body: {                                                  │
│       message: {                                             │
│         sequenceId: Date.now(),                              │
│         type: "Text",                                        │
│         text: "transcribed text"                             │
│       }                                                      │
│     }                                                        │
│                                                              │
│     Polling: Every 1s until status = "Completed"             │
│     Max wait: 120 seconds                                    │
│     Terminal statuses: Completed, Error, EndSession           │
│                                                              │
│     Response parsing:                                        │
│     - Extracts text from msg.text or msg.message fields      │
│     - Joins multiple messages with paragraph breaks           │
│     Returns: { text: "agent response", status: "Completed" } │
└──────────────────────────┬──────────────────────────────────┘
                           │ Agent response text
                           ▼
              ┌────────────┴────────────┐
              │                         │
    CUSTOM mode                   FULL mode
              │                         │
              ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  4a. EXTERNAL TTS         │  │  4b. HEYGEN TTS           │
│  POST /api/tts            │  │  (built into SDK)         │
│  Body: { text: "..." }    │  │                           │
│                           │  │  session.repeat(text)     │
│  OpenAI:                  │  │  → HeyGen generates audio │
│    POST openai.com/v1/    │  │  → Renders lip-sync       │
│      audio/speech         │  │  → Single step            │
│    Model: tts-1           │  │                           │
│    Format: PCM 24kHz      │  │                           │
│    Voice: alloy (default) │  │                           │
│                           │  │                           │
│  ElevenLabs:              │  │                           │
│    POST elevenlabs.io/v1/ │  │                           │
│      text-to-speech/{id}  │  │                           │
│    Model: eleven_         │  │                           │
│      multilingual_v2      │  │                           │
│    Format: PCM 24kHz      │  │                           │
│                           │  │                           │
│  Returns: base64 audio    │  │                           │
│                           │  │                           │
│  session.repeatAudio(     │  │                           │
│    audioBase64)           │  │                           │
│  → Avatar lip-syncs to    │  │                           │
│    pre-generated audio    │  │                           │
└──────────────┬───────────┘  └────────────┬──────────────┘
               │                            │
               └────────────┬───────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  5. AVATAR SPEAKS                                            │
│     → AVATAR_SPEAK_STARTED event                             │
│     → UI shows "Avatar Speaking" indicator                   │
│     → User can click "Interrupt" to stop                     │
│                                                              │
│     → AVATAR_SPEAK_ENDED event                               │
│     → Latency timeline displayed                             │
│     → Status returns to "Ready"                              │
│     → Loop repeats from step 1                               │
└─────────────────────────────────────────────────────────────┘
```

---

## FULL vs CUSTOM Mode

The app supports two operational modes that differ in how text-to-speech is handled:

### FULL Mode (default)

```
User speaks → HeyGen STT → Agentforce → session.repeat(text) → Avatar speaks
                                              │
                                    HeyGen handles TTS
                                    + avatar animation
                                    in a single step
```

- HeyGen's built-in TTS converts the Agentforce response to speech
- `LIVEAVATAR_CONTEXT_ID` is sent to HeyGen (enables HeyGen's built-in AI, which we interrupt)
- `session.interrupt()` is called before sending to Agentforce to cancel any built-in AI response
- Latency timeline: **3 segments** (STT → Agent → Avatar)
- Simpler setup — no external TTS API keys needed

### CUSTOM Mode

```
User speaks → HeyGen STT → Agentforce → /api/tts → session.repeatAudio(base64) → Avatar speaks
                                            │
                                  OpenAI or ElevenLabs
                                  generates PCM audio
                                  (separate step)
```

- External TTS (OpenAI or ElevenLabs) generates PCM 24kHz audio
- Audio sent to avatar as base64 via `session.repeatAudio()`
- `LIVEAVATAR_CONTEXT_ID` is **not** sent to HeyGen
- No `session.interrupt()` needed (no built-in AI active)
- Latency timeline: **4 segments** (STT → Agent → TTS → Avatar)
- More control over voice quality and multilingual support

### When to Use Which

| Scenario | Recommended Mode |
|----------|-----------------|
| Quick demo, English | FULL |
| Need specific voice characteristics | CUSTOM |
| Multilingual with non-HeyGen voices | CUSTOM |
| Lowest possible latency | FULL |
| ElevenLabs voice cloning | CUSTOM |

---

## Latency Timeline

The app tracks and displays the duration of each processing stage:

```
CUSTOM mode:
├── STT ██████░░░░░░░░░░░░░░░░░░░░░░ 0.5s  (HeyGen / Deepgram)
├── Agent ░░░░░░██████████░░░░░░░░░░░ 1.2s  (Salesforce Agentforce)
├── TTS ░░░░░░░░░░░░░░░░████░░░░░░░░ 0.4s  (OpenAI / ElevenLabs)
└── Avatar ░░░░░░░░░░░░░░░░░░░░████████ 2.1s  (HeyGen Render)
                                    Total: 4.2s

FULL mode:
├── STT ██████░░░░░░░░░░░░░░░░░░░░░░ 0.5s  (HeyGen / Deepgram)
├── Agent ░░░░░░██████████░░░░░░░░░░░ 1.2s  (Salesforce Agentforce)
└── Avatar ░░░░░░░░░░░░░░░░████████████ 2.5s  (HeyGen TTS + Render)
                                    Total: 4.2s
```

Timing is captured at each transition:
- **STT start:** `USER_SPEAK_ENDED` event timestamp
- **STT end / Agent start:** `USER_TRANSCRIPTION` event → `fetch('/api/agent')` begins
- **Agent end / TTS start:** Agent response received
- **TTS end / Avatar start:** `repeatAudio()` or `repeat()` called
- **Avatar end:** `AVATAR_SPEAK_ENDED` event

---

## Deployment Modes

### Standalone (Main Page)

Full-screen experience at `/`. Two-column layout with avatar video and conversation panel.

```
┌─────────────────────────────────────────────────┐
│  [Logo]  Customer Header (via URL params)        │
├────────────────────┬────────────────────────────┤
│                    │  Conversation               │
│   Avatar Video     │  ┌─────────────────────┐   │
│   (WebRTC)         │  │ User: How do I...    │   │
│                    │  │ Agent: You can...    │   │
│   [Status Badge]   │  │                     │   │
│                    │  └─────────────────────┘   │
│                    │                            │
│                    │  [Latency Timeline]        │
├────────────────────┴────────────────────────────┤
│  [Start Voice Chat]  [Mute]  [Interrupt]        │
└─────────────────────────────────────────────────┘
```

### Embedded Widget (Embed Page)

Compact version at `/embed`, designed to be loaded inside an iframe:

```
┌──────────────────────┐
│ AI Assistant    [─][×]│  ← minimize / disconnect
├──────────────────────┤
│                      │
│   Avatar Video       │
│   (compact)          │
│                      │
├──────────────────────┤
│  User: How do I...   │
│  Agent: You can...   │
├──────────────────────┤
│ [Voice Chat] [Mute]  │
└──────────────────────┘
```

Communication with parent page via `postMessage`:
- **Minimize:** embed sends `{ type: 'avatar-widget-minimize' }` → parent hides panel
- **Restore:** parent sends `{ type: 'avatar-widget-restore' }` → embed opens from minimized state

### Demo Proxy

The `/api/demo/proxy` endpoint loads a customer's website and injects the embed widget as a floating chat button:

```
┌─────────────────────────────────────────────────┐
│ [Simulation] Showing: https://customer.com  [×] │  ← URL banner
├─────────────────────────────────────────────────┤
│                                                  │
│            Customer's Website                    │
│            (proxied HTML)                        │
│                                                  │
│                        ┌──────────────────────┐  │
│                        │ AI Assistant    [─]   │  │
│                        │                      │  │
│                        │  Avatar Video        │  │
│                        │                      │  │
│                        │  Conversation        │  │
│                        │                      │  │
│                        └──────────────────────┘  │
│                                           [💬]   │  ← floating button
└─────────────────────────────────────────────────┘
```

**Proxy processing pipeline:**
1. Fetch customer HTML
2. Strip CSP meta tags (to allow injected content)
3. Inject `<base href>` tag (resolve relative URLs to customer origin)
4. Rewrite iframe `src` attributes to go through proxy (avoids frame-ancestors blocks)
5. Inject iframe proxy script (intercepts dynamic `iframe.src` assignments)
6. Inject floating widget button + embed iframe panel
7. Return modified HTML with permissive CSP headers

**SSRF protection:** All URLs validated against blocked IP ranges (RFC 1918, loopback, link-local, cloud metadata endpoints). Redirect targets are also validated.

---

## Customer Branding

The app supports per-customer branding without code changes, via URL parameters:

```
https://your-app.com/?logo=https://cdn.brandfetch.io/.../logo.png
                     &color=%23ff5000
                     &homeUrl=https://www.customer.com
                     &logoAlt=Customer Name
                     &lang=nl
```

**Routing logic in SiteHeader:**
```
URL has ?logo= parameter?
├── Yes → GenericHeader (renders logo, color, homeUrl from params)
└── No → URL has ?site= parameter?
         ├── Yes → Custom header component (e.g., MyCustomerHeader)
         └── No → No header
```

All URL parameters are sanitized:
- `logo`, `homeUrl` → `sanitizeUrl()` — must be `http://` or `https://` (blocks `javascript:` XSS)
- `color` → `sanitizeColor()` — must match `/^#[0-9a-fA-F]{3,8}$/`

---

## Security Architecture

### Authentication Layers

```
Browser → API Routes
           │
           ├── Rate limiting (all routes, per IP, token bucket)
           │   ├── /api/admin/auth:       5/min
           │   ├── /api/demo/proxy:      30/min
           │   ├── /api/agent:           60/min
           │   ├── /api/tts:             60/min
           │   ├── /api/liveavatar/token: 60/min
           │   └── default:             120/min
           │
           ├── API_SECRET check (optional, all non-admin routes)
           │   └── Authorization: Bearer ${API_SECRET}
           │      or X-API-Key: ${API_SECRET}
           │
           └── Admin auth (admin routes only)
               └── admin_token cookie (HMAC-SHA256, 15 min expiry)
                   ├── httpOnly (no JS access)
                   ├── secure (HTTPS only in production)
                   ├── sameSite: lax
                   └── path: /api/admin
```

### SSRF Protection (Demo Proxy)

```
User provides URL → validateUrl()
                    ├── Protocol check: http/https only
                    ├── Blocked hostnames: metadata.google.internal, etc.
                    ├── IP literal check: 127.*, 10.*, 192.168.*, 169.254.*, etc.
                    ├── localhost check
                    ├── IPv6 check: ::1, fc/fd (ULA), fe80 (link-local)
                    └── DNS resolution check: resolve hostname, verify IP ranges
                        └── Redirect targets also validated
```

### Input Sanitization

- **Colors:** Must match hex pattern (`#fff`, `#ff5500`, etc.) or fallback to default
- **URLs:** Must be `http://` or `https://` — blocks `javascript:`, `data:`, `file:` protocols
- **Error messages:** Generic errors returned to client (no stack traces, no raw API responses)
- **Admin tokens:** Timing-safe comparison prevents timing attacks on password/token verification

---

## Session Lifecycle

```
                    ┌──────────────┐
                    │   INACTIVE   │
                    └──────┬───────┘
                           │ User clicks Connect
                           ▼
                    ┌──────────────┐
                    │  CONNECTING  │  ← Token + agent session created
                    └──────┬───────┘    ← SDK initializing WebRTC
                           │ SESSION_STREAM_READY
                           ▼
                    ┌──────────────┐
            ┌──────│  CONNECTED   │──────┐
            │      └──────┬───────┘      │
            │             │              │
     Voice chat      Conversation    User clicks
     start/stop       loop runs      Disconnect
            │             │              │
            └─────────────┘              │
                                         ▼
                                  ┌──────────────┐
                                  │DISCONNECTING │  ← Agent session deleted
                                  └──────┬───────┘    ← SDK cleanup
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │ DISCONNECTED │
                                  └──────────────┘
```

**Resource cleanup on disconnect:**
1. Agentforce session deleted: `DELETE /api/agent/session`
2. HeyGen session cleaned up by SDK
3. WebRTC connection closed
4. Microphone stream released
5. All React state reset

---

## Key Files

```
src/
├── app/
│   ├── page.tsx                    # Main page — orchestrates connect/disconnect
│   ├── embed/page.tsx              # Embeddable widget version
│   ├── admin/page.tsx              # Admin panel UI
│   ├── demo/page.tsx               # Demo proxy configuration page
│   └── api/
│       ├── liveavatar/
│       │   ├── token/route.ts      # Creates HeyGen session token
│       │   └── session/route.ts    # HeyGen session management
│       ├── agent/
│       │   ├── route.ts            # Sends message to Agentforce
│       │   └── session/route.ts    # Creates/deletes Agentforce sessions
│       ├── tts/route.ts            # Text-to-speech (CUSTOM mode)
│       ├── demo/proxy/route.ts     # Proxies customer sites + injects widget
│       └── admin/
│           ├── auth/route.ts       # Admin login (password → cookie)
│           ├── config/route.ts     # View/edit env vars
│           └── liveavatar/route.ts # Browse avatars/voices/contexts
├── lib/
│   ├── agentforce.ts               # Salesforce OAuth + Agent API client
│   ├── auth.ts                     # HMAC token generation/verification
│   ├── apiGuard.ts                 # Rate limiting + API key enforcement
│   ├── rateLimit.ts                # Token bucket rate limiter
│   ├── validateUrl.ts              # SSRF protection
│   ├── sanitize.ts                 # XSS prevention (color, URL)
│   ├── configProvider.ts           # Platform-agnostic config (Heroku/env)
│   └── sessionStore.ts            # In-memory session store (TTL + max size)
└── components/
    ├── LiveAvatarSession.tsx        # HeyGen SDK wrapper + conversation flow
    ├── SiteHeader.tsx               # Header router
    └── GenericHeader.tsx            # URL-param driven header
```

---

## External Service Dependencies

| Service | Purpose | Protocol | Auth Method |
|---------|---------|----------|-------------|
| HeyGen LiveAvatar | Avatar rendering, STT | WebRTC + REST | API key (`X-API-KEY` header) |
| Salesforce Agentforce | AI agent responses | REST | OAuth 2.0 Client Credentials |
| OpenAI | Text-to-speech (CUSTOM mode) | REST | Bearer token |
| ElevenLabs | Text-to-speech (CUSTOM mode) | REST | `xi-api-key` header |
| Heroku Platform API | Config management (optional) | REST | Bearer token |
| Deepgram | Speech-to-text | via HeyGen SDK | Managed by HeyGen |
