import { NextRequest, NextResponse } from 'next/server';
import { apiGuard } from '@/lib/apiGuard';
import { storeSession } from '@/lib/sessionStore';

/**
 * Create LiveAvatar session token
 * POST https://api.liveavatar.com/v1/sessions/token
 *
 * Supports two modes via LIVEAVATAR_MODE env var:
 * - 'full' (default): English, uses LiveAvatar TTS
 * - 'custom': Dutch, uses external TTS (OpenAI)
 */
export async function POST(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  const apiKey = process.env.LIVEAVATAR_API_KEY;
  const apiUrl = process.env.LIVEAVATAR_API_URL || 'https://api.liveavatar.com';
  const avatarId = process.env.LIVEAVATAR_AVATAR_ID;
  const voiceId = process.env.LIVEAVATAR_VOICE_ID;
  const contextId = process.env.LIVEAVATAR_CONTEXT_ID;

  // Mode determines TTS behavior, language is configurable separately
  const mode = (process.env.LIVEAVATAR_MODE || 'full').toLowerCase() as 'full' | 'custom';
  const language = process.env.LIVEAVATAR_LANGUAGE || 'en';

  if (!apiKey) {
    return NextResponse.json(
      { error: 'LIVEAVATAR_API_KEY not configured' },
      { status: 500 }
    );
  }

  if (!avatarId) {
    return NextResponse.json(
      { error: 'LIVEAVATAR_AVATAR_ID not configured' },
      { status: 500 }
    );
  }

  try {
    // Build avatar_persona based on mode
    const avatarPersona: Record<string, unknown> = {
      voice_id: voiceId,
      language,
    };

    // Only include context_id for FULL mode (required for built-in AI)
    if (mode === 'full' && contextId) {
      avatarPersona.context_id = contextId;
    }

    console.log('Creating LiveAvatar session:', { mode: mode.toUpperCase(), language });

    const response = await fetch(`${apiUrl}/v1/sessions/token`, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: mode.toUpperCase(),
        avatar_id: avatarId,
        avatar_persona: avatarPersona,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.data?.[0]?.message ||
                          errorData.message ||
                          `Failed to get token (${response.status})`;
      console.error('LiveAvatar token error:', response.status, errorData);
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();

    const sessionToken = data.data.session_token;
    const sessionId = data.data.session_id;

    // Store session for cleanup
    storeSession(sessionId, sessionToken);

    console.log('LiveAvatar token created:', {
      session_id: sessionId,
      mode: mode.toUpperCase(),
      language,
      hasToken: !!sessionToken,
    });

    return NextResponse.json({
      session_token: sessionToken,
      session_id: sessionId,
      mode,
      language,
    });
  } catch (error) {
    console.error('LiveAvatar token error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get token' },
      { status: 500 }
    );
  }
}
