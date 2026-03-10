import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth';
import { apiGuard } from '@/lib/apiGuard';
import { getConfigProvider } from '@/lib/configProvider';

// Keys that should be masked in the response
const SECRET_KEYS = [
  'LIVEAVATAR_API_KEY',
  'SF_CLIENT_ID',
  'SF_CLIENT_SECRET',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'HEYGEN_API_KEY',
  'HEROKU_API_KEY',
  'ADMIN_PASSWORD',
  'API_SECRET',
  'DEEPGRAM_API_KEY',
];

// Keys that are relevant to the app (filter out Heroku system vars)
const APP_CONFIG_KEYS = [
  'LIVEAVATAR_API_KEY',
  'LIVEAVATAR_AVATAR_ID',
  'LIVEAVATAR_VOICE_ID',
  'LIVEAVATAR_CONTEXT_ID',
  'LIVEAVATAR_MODE',
  'LIVEAVATAR_LANGUAGE',
  'SF_INSTANCE_URL',
  'SF_CLIENT_ID',
  'SF_CLIENT_SECRET',
  'SF_AGENT_ID',
  'OPENAI_API_KEY',
  'TTS_PROVIDER',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE_ID',
];

function maskValue(key: string, value: string): string {
  if (SECRET_KEYS.includes(key) && value && value.length > 4) {
    return '•'.repeat(Math.min(value.length - 4, 20)) + value.slice(-4);
  }
  return value;
}

export async function GET(request: NextRequest) {
  const authResponse = authenticateAdmin(request);
  if (authResponse) return authResponse;
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  try {
    const provider = getConfigProvider();
    const allVars = await provider.getConfig();

    const configs = APP_CONFIG_KEYS.map((key) => ({
      key,
      value: allVars[key] || '',
      masked: maskValue(key, allVars[key] || ''),
      isSecret: SECRET_KEYS.includes(key),
    }));

    return NextResponse.json({
      configs,
      provider: provider.providerName,
      readonly: provider.readonly,
    });
  } catch (error) {
    console.error('Config fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResponse = authenticateAdmin(request);
  if (authResponse) return authResponse;
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  try {
    const provider = getConfigProvider();

    if (provider.readonly) {
      return NextResponse.json(
        { error: 'Configuration is read-only. Update environment variables in your deployment platform.' },
        { status: 403 }
      );
    }

    const { configs } = await request.json();
    const updates: Record<string, string> = {};

    for (const { key, value } of configs) {
      if (APP_CONFIG_KEYS.includes(key)) {
        if (SECRET_KEYS.includes(key)) {
          if (value && !value.startsWith('•')) {
            updates[key] = value;
          }
        } else {
          updates[key] = value;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await provider.setConfig(updates);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Config update error:', error);
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 }
    );
  }
}
