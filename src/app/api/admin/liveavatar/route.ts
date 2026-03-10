import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth';
import { apiGuard } from '@/lib/apiGuard';

const LIVEAVATAR_API_URL = 'https://api.liveavatar.com';

interface Avatar {
  avatar_id: string;
  name: string;
  preview_url?: string;
  thumbnail_url?: string;
  default_voice?: { id: string; name: string };
}

interface Voice {
  voice_id: string;
  name: string;
  language?: string;
  gender?: string;
  preview_audio_url?: string;
}

interface Context {
  context_id: string;
  name: string;
  description?: string;
}

async function fetchLiveAvatar(endpoint: string) {
  const apiKey = process.env.LIVEAVATAR_API_KEY;

  if (!apiKey) {
    throw new Error('LiveAvatar API key not configured');
  }

  const response = await fetch(`${LIVEAVATAR_API_URL}${endpoint}`, {
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LiveAvatar API error: ${response.status} - ${text}`);
  }

  return response.json();
}

function extractResults(response: Record<string, unknown>): Record<string, unknown>[] {
  // LiveAvatar API returns { code, data: { results: [...] }, message }
  const data = response.data as Record<string, unknown> | undefined;
  if (data && Array.isArray(data.results)) return data.results;
  // Fallback for alternative response shapes
  if (Array.isArray(response.avatars)) return response.avatars;
  if (Array.isArray(response.voices)) return response.voices;
  if (Array.isArray(response.contexts)) return response.contexts;
  return [];
}

async function getAvatars(): Promise<Avatar[]> {
  // Fetch both public and user avatars
  const [publicRes, userRes] = await Promise.all([
    fetchLiveAvatar('/v1/avatars/public').catch(() => ({})),
    fetchLiveAvatar('/v1/avatars').catch(() => ({})),
  ]);

  const allAvatars: Avatar[] = [];
  const seen = new Set<string>();

  for (const avatar of [...extractResults(publicRes), ...extractResults(userRes)]) {
    const a = avatar as Record<string, unknown>;
    const id = (a.avatar_id || a.id) as string;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const dv = a.default_voice as Record<string, string> | undefined;
    allAvatars.push({
      avatar_id: id,
      name: (a.name || id) as string,
      preview_url: (a.preview_url || a.thumbnail_url || a.preview_image_url) as string | undefined,
      thumbnail_url: (a.thumbnail_url || a.preview_url) as string | undefined,
      default_voice: dv ? { id: dv.id, name: dv.name } : undefined,
    });
  }

  return allAvatars;
}

async function getVoices(): Promise<Voice[]> {
  const response = await fetchLiveAvatar('/v1/voices');
  const voices: Voice[] = [];

  for (const item of extractResults(response)) {
    const v = item as Record<string, unknown>;
    voices.push({
      voice_id: (v.voice_id || v.id) as string,
      name: (v.name || v.voice_id || v.id || 'Unknown') as string,
      language: (v.language || v.locale || 'en') as string,
      gender: (v.gender || 'unknown') as string,
      preview_audio_url: (v.preview_audio_url || v.sample_url || v.preview_url) as string | undefined,
    });
  }

  return voices;
}

async function getContexts(): Promise<Context[]> {
  const response = await fetchLiveAvatar('/v1/contexts');
  const contexts: Context[] = [];

  for (const item of extractResults(response)) {
    const c = item as Record<string, unknown>;
    const sp = c.system_prompt as string | undefined;
    contexts.push({
      context_id: (c.context_id || c.id) as string,
      name: (c.name || c.context_id || c.id || 'Unknown') as string,
      description: (c.description || sp?.slice(0, 100) || '') as string,
    });
  }

  return contexts;
}

export async function GET(request: NextRequest) {
  try {
    const authResponse = authenticateAdmin(request);
    if (authResponse) return authResponse;
    const guardResponse = apiGuard(request);
    if (guardResponse) return guardResponse;

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');

    switch (type) {
      case 'avatars':
        const avatars = await getAvatars();
        return NextResponse.json({ avatars });

      case 'voices':
        const voices = await getVoices();
        return NextResponse.json({ voices });

      case 'contexts':
        const contexts = await getContexts();
        return NextResponse.json({ contexts });

      default:
        return NextResponse.json(
          { error: 'Invalid type. Use: avatars, voices, or contexts' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('LiveAvatar API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch LiveAvatar resources' },
      { status: 500 }
    );
  }
}
