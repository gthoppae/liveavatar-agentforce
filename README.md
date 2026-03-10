# LiveAvatar + Agentforce Demo

A voice-enabled AI avatar that connects [HeyGen LiveAvatar](https://www.heygen.com/) streaming avatars with [Salesforce Agentforce](https://www.salesforce.com/agentforce/) as the AI backend. Users speak to the avatar, their speech is transcribed, sent to Agentforce, and the response is spoken back by the avatar.

Built for presales teams to demonstrate voice-enabled AI avatar experiences during customer engagements.

## How It Works

```
User speaks → HeyGen STT (Deepgram) → /api/agent (Agentforce) → avatar.speak()
```

1. User speaks freely (continuous voice chat with voice activity detection)
2. HeyGen SDK transcribes speech via built-in Deepgram STT
3. Text sent to `/api/agent` with session ID -> Agentforce Agent API -> response text
4. Response passed to `avatar.speak()` -> HeyGen renders talking avatar

**Documentation:**
- [INSTALL.md](INSTALL.md) — Step-by-step installation guide with Salesforce and HeyGen setup
- [CONFIGURATION.md](CONFIGURATION.md) — Complete environment variable reference
- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed solution design and data flow

## Prerequisites

- **Node.js 20.x**
- **HeyGen LiveAvatar account** - [liveavatar.com](https://liveavatar.com) for API key, avatar ID, voice ID
- **Salesforce org with Agentforce** - Connected App with Client Credentials flow, an Agentforce Agent ID
- **OpenAI API key** (optional) - only needed for CUSTOM mode TTS

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd liveavatar-agentforce-app
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials. At minimum you need:

| Variable | Description |
|----------|-------------|
| `LIVEAVATAR_API_KEY` | API key from liveavatar.com |
| `LIVEAVATAR_AVATAR_ID` | Avatar ID from LiveAvatar dashboard |
| `LIVEAVATAR_VOICE_ID` | Voice ID from LiveAvatar dashboard |
| `SF_INSTANCE_URL` | Your Salesforce org URL |
| `SF_CLIENT_ID` | Connected App Consumer Key |
| `SF_CLIENT_SECRET` | Connected App Consumer Secret |
| `SF_AGENT_ID` | Agentforce Agent ID |

See [CONFIGURATION.md](CONFIGURATION.md) for detailed documentation on every variable, how modes work, and example configurations.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** HeyGen's WebRTC requires HTTPS for microphone access. For local testing with voice, use [ngrok](https://ngrok.com/): `ngrok http 3000`

## Deployment Options

### Docker

```bash
docker build -t liveavatar .
docker run -p 3000:3000 --env-file .env.local liveavatar
```

> **Note:** Docker's `--env-file` does not support quotes or inline comments. Use `KEY=value` (not `KEY="value"` or `KEY=value #comment`). Next.js's `.env.local` parser is more forgiving, so your file may work with `npm run dev` but fail in Docker.

Or with Docker Compose:

```bash
docker compose up --build
```

### Heroku

```bash
heroku create your-app-name
heroku config:set LIVEAVATAR_API_KEY=xxx SF_CLIENT_ID=xxx ... -a your-app-name
git push heroku main
```

The included `Procfile` and `app.json` handle Heroku configuration automatically.

**Admin config management on Heroku:** To enable editing environment variables from the `/admin` web UI, set these additional config vars:

```bash
heroku config:set ADMIN_PASSWORD=your-admin-password -a your-app-name
heroku config:set HEROKU_API_KEY=$(heroku auth:token) -a your-app-name
heroku config:set HEROKU_APP_NAME=your-app-name -a your-app-name
```

This lets you update API keys, avatar/voice selection, and other settings from the browser without redeploying. Changes are saved via the Heroku Platform API and take effect after the automatic dyno restart.

**Sharing with teammates:** If teammates use the same Salesforce org, just share the app URL with appropriate branding params. If they use a different org, they'll need to update the Salesforce config vars (`SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_AGENT_ID`) for their org.

### Other Platforms

The app produces a standalone Next.js build (`output: 'standalone'` in `next.config.mjs`). Deploy to any platform that runs Node.js:

```bash
npm run build
node .next/standalone/server.js
```

## Customer Branding

Customize the app's appearance for different customers using URL parameters -- no code changes needed:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `logo` | Customer logo URL (PNG, SVG) | `https://cdn.brandfetch.io/.../logo.png` |
| `logoAlt` | Alt text for logo | `Acme Corp` |
| `homeUrl` | Link when clicking logo | `https://www.acme.com` |
| `color` | Brand accent color (URL-encoded hex) | `%23ff5000` |
| `site` | Use a predefined custom header | `mycustomer` |
| `lang` | UI language | `nl`, `en`, `fr` |

**Example:**
```
https://your-app.com/?logo=https://cdn.brandfetch.io/idNmg4CRBW/w/241/h/72/theme/dark/logo.png&color=%23ff5000&homeUrl=https://www.acme.com&logoAlt=Acme
```

Find customer logos at [brandfetch.com](https://brandfetch.com/).

## Demo Proxy

The `/demo` endpoint proxies a customer's website and injects the avatar chat widget, so you can show the avatar running "on" the customer's site:

```
https://your-app.com/api/demo/proxy?url=https://www.customer-site.com&color=%230077b6
```

Or use the demo configuration page at `/demo` to generate a Tampermonkey userscript for browser-extension-based demos.

## Admin Panel

Access `/admin` to manage configuration through a web UI. Set the `ADMIN_PASSWORD` environment variable to enable it.

- On Heroku (with `HEROKU_API_KEY` and `HEROKU_APP_NAME` set): configs are editable and saved via Heroku Platform API
- On other platforms: configs are read-only (update via your platform's env var management)

## Architecture

```
liveavatar-agentforce-app/
  src/
    app/
      page.tsx              # Main UI - orchestrates the conversation flow
      admin/page.tsx         # Admin configuration panel
      demo/page.tsx          # Demo proxy configuration
      embed/page.tsx         # Embeddable widget version
      api/
        agent/route.ts       # Send message to Agentforce
        agent/session/       # Create/delete Agentforce sessions
        liveavatar/token/    # Get HeyGen LiveAvatar session token
        liveavatar/session/  # LiveAvatar session management
        tts/route.ts         # Text-to-speech (OpenAI / ElevenLabs)
        demo/proxy/route.ts  # Demo site proxy with widget injection
        admin/               # Admin auth and config management
    lib/
      agentforce.ts          # Salesforce Agentforce API client
      auth.ts                # Admin authentication (HMAC tokens)
      apiGuard.ts            # Rate limiting + API key enforcement
      validateUrl.ts         # SSRF protection for proxy
      sanitize.ts            # Input sanitization (XSS prevention)
      configProvider.ts      # Platform-agnostic config management
      sessionStore.ts        # In-memory session store with TTL
    components/
      LiveAvatarSession.tsx  # HeyGen LiveAvatar SDK wrapper
      SiteHeader.tsx         # Header router (generic or custom per customer)
      GenericHeader.tsx       # URL-param driven header for any customer
```

## Security

- **Admin panel** protected by password + httpOnly cookie tokens (15 min expiry)
- **Rate limiting** on all API routes (token bucket per IP)
- **SSRF protection** on demo proxy (blocks private IPs, cloud metadata endpoints)
- **Input sanitization** for URL parameters (XSS prevention)
- **Optional API key** (`API_SECRET` env var) to lock down all non-admin API routes
- **No secrets in responses** -- error messages are generic, no raw data leaked

## Salesforce Agentforce Setup

1. **Create a Connected App** in your Salesforce org with OAuth 2.0 Client Credentials flow
2. **Enable the Agentforce Agent** you want to use
3. **Note the Agent ID** from the Agentforce setup page
4. **Set the environment variables**: `SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_AGENT_ID`

The app passes `channel: voice_api` as a context variable to Agentforce, which you can use in your agent's configuration to return text-only responses (no rich formatting).

## HeyGen LiveAvatar Modes

| Mode | Description | Required Env Vars |
|------|-------------|-------------------|
| `full` (default) | HeyGen handles TTS. User speaks -> Agentforce responds -> avatar speaks the response | `LIVEAVATAR_API_KEY`, `LIVEAVATAR_AVATAR_ID`, `LIVEAVATAR_VOICE_ID` |
| `custom` | External TTS (OpenAI/ElevenLabs). Same flow but TTS is done server-side | Above + `OPENAI_API_KEY` or `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` |

Set `LIVEAVATAR_MODE=full` or `LIVEAVATAR_MODE=custom` in your environment.

## License

[MIT](LICENSE)
