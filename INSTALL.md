# Installation Guide

## Quick Setup

The interactive setup script handles everything below automatically:

```bash
git clone https://github.com/gthoppae/liveavatar-agentforce.git
cd liveavatar-agentforce
./setup.sh
```

After initial setup, use the quick-start script:

```bash
./server.sh                         # Start dev server, open browser
./server.sh kncb.nl '#ff6600' nl    # Start with customer demo proxy
```

If you prefer manual setup, follow the steps below.

---

## Prerequisites

- **Node.js 20+** ([download](https://nodejs.org/))
- **HeyGen LiveAvatar account** — [liveavatar.com](https://liveavatar.com)
- **Salesforce org with Agentforce** — with a Connected App configured for OAuth 2.0 Client Credentials flow

## Step 1: Clone the Repository

```bash
git clone https://github.com/gthoppae/liveavatar-agentforce.git
cd liveavatar-agentforce
npm install
```

## Step 2: Set Up HeyGen LiveAvatar

1. Sign up at [liveavatar.com](https://liveavatar.com)
2. Go to your dashboard and note your **API Key**
3. Browse available avatars and pick an **Avatar ID**
4. Note the avatar's default **Voice ID** (or pick a different voice)
5. Optionally, create a **Context** for avatar personality/knowledge and note the **Context ID**

> After installation, you can also browse avatars, voices, and contexts from the app's admin panel at `/admin`.

## Step 3: Set Up Salesforce Agentforce

### Create a Connected App

1. In Salesforce Setup, go to **App Manager** → **New Connected App**
2. Enable **OAuth Settings**:
   - Callback URL: `https://login.salesforce.com/services/oauth2/callback` (not used, but required)
   - Selected OAuth Scopes: `api`, `cdp_api`
3. Save and wait a few minutes for it to propagate
4. Under the Connected App, enable **Client Credentials Flow**:
   - Edit Policies → "Enable Client Credentials Flow"
   - Assign a **Run As** user
5. Note the **Consumer Key** (Client ID) and **Consumer Secret** (Client Secret)

### Get the Agent ID

1. Go to **Setup** → **Agents** (or **Agentforce**)
2. Open the agent you want to use
3. The **Agent ID** is in the URL or on the agent detail page (starts with `0Xx`)

### Note Your Instance URL

Your Salesforce org URL, e.g., `https://your-org.my.salesforce.com`

## Step 4: Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```bash
# HeyGen LiveAvatar (from Step 2)
LIVEAVATAR_API_KEY=your-api-key-here
LIVEAVATAR_AVATAR_ID=your-avatar-id-here
LIVEAVATAR_VOICE_ID=your-voice-id-here

# Salesforce Agentforce (from Step 3)
SF_INSTANCE_URL=https://your-org.my.salesforce.com
SF_CLIENT_ID=your-consumer-key-here
SF_CLIENT_SECRET=your-consumer-secret-here
SF_AGENT_ID=your-agent-id-here
```

This is the minimum configuration. See [CONFIGURATION.md](CONFIGURATION.md) for all available options including language, TTS providers, admin panel, and security settings.

## Step 5: Run the App

### Option A: Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Option B: Docker

```bash
docker build -t liveavatar .
docker run -p 3000:3000 --env-file .env.local liveavatar
```

> **Docker `.env.local` format:** Docker's `--env-file` does not support quotes or inline comments. Use `KEY=value` only (not `KEY="value"` or `KEY=value #comment`).

Or with Docker Compose:

```bash
docker compose up --build
```

### Option C: Heroku

```bash
heroku create your-app-name
heroku config:set LIVEAVATAR_API_KEY=xxx SF_CLIENT_ID=xxx ... -a your-app-name
git push heroku main
```

See the [Heroku section in README.md](README.md#heroku) for admin config management setup.

## Step 6: Verify

1. Open the app in your browser
2. Click **Connect** — you should see the avatar appear (takes 10-20 seconds for WebRTC connection)
3. Click **Start Voice Chat** — allow microphone access
4. Speak to the avatar — your speech is transcribed, sent to Agentforce, and the avatar speaks the response

### HTTPS for Voice Chat

HeyGen's WebRTC requires a secure context for microphone access. This works on `localhost` automatically, but for remote access or testing on other devices:

```bash
# Use ngrok to get an HTTPS URL
ngrok http 3000
```

## Step 7: Optional Setup

### Admin Panel

Set an admin password to enable the `/admin` panel:

```bash
# Add to .env.local
ADMIN_PASSWORD=your-admin-password
```

The admin panel lets you:
- View current configuration
- Browse and select avatars, voices, and contexts (with avatar-voice auto-pairing)
- Copy configuration values for `.env.local`

### Customer Branding

Customize the app's appearance per customer using URL parameters — no code changes needed:

```
http://localhost:3000/?logo=https://cdn.brandfetch.io/.../logo.png&color=%23ff5000&homeUrl=https://www.customer.com&logoAlt=Customer
```

Find customer logos at [brandfetch.com](https://brandfetch.com/).

### API Security

Lock down API routes with a shared secret:

```bash
# Add to .env.local
API_SECRET=your-random-api-key
```

When set, all API calls (except admin routes) must include `Authorization: Bearer your-random-api-key` or `X-API-Key: your-random-api-key`.

### Demo Proxy

Show the avatar running "on" a customer's website:

```
http://localhost:3000/api/demo/proxy?url=https://www.customer-site.com&color=%230077b6
```

Or visit `/demo` to generate a Tampermonkey userscript for browser-extension-based demos.

## Troubleshooting

### "LIVEAVATAR_API_KEY not configured"

The `LIVEAVATAR_API_KEY` environment variable is not set or empty. Check your `.env.local` file.

### "Invalid API key" on Connect

The HeyGen API key is incorrect or expired. Generate a new one at [liveavatar.com](https://liveavatar.com).

### Avatar appears but no voice response

- Check that the Salesforce environment variables are correct (`SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_AGENT_ID`)
- Check the terminal/server logs for OAuth or Agentforce errors
- Verify the Connected App has Client Credentials flow enabled and a Run As user assigned

### "Request validation errors" (UUID errors) in Docker

Your `.env.local` has inline `#comments` after values. Docker includes everything after `=` as the value. Remove comments:

```bash
# Wrong (Docker reads the comment as part of the value):
LIVEAVATAR_AVATAR_ID=65f9e3c9-... #June

# Correct:
LIVEAVATAR_AVATAR_ID=65f9e3c9-...
```

### Microphone not working

- Ensure you're on HTTPS (or localhost)
- Check browser permissions for microphone access
- Try using ngrok: `ngrok http 3000`

### Avatar takes a long time to appear

The WebRTC connection to HeyGen can take 10-20 seconds. This is normal. Check the browser console for any errors if it takes longer.

## Next Steps

- [CONFIGURATION.md](CONFIGURATION.md) — Full environment variable reference with examples
- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed solution design and data flow
- [README.md](README.md) — Project overview, deployment options, and branding
