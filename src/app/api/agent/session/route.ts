import { NextRequest, NextResponse } from 'next/server';
import { apiGuard } from '@/lib/apiGuard';
import {
  startSession,
  endSession,
  getConfigFromEnv,
} from '@/lib/agentforce';

/**
 * Create a new Agentforce session
 * Passes channel=voice_api context variable to indicate text-only rendering
 */
export async function POST(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  try {
    const config = getConfigFromEnv();
    const sessionId = await startSession(config, {
      contextVariables: [
        { name: 'channel', type: 'Text', value: 'voice_api' }
      ]
    });
    return NextResponse.json({ sessionId });
  } catch (error) {
    console.error('Failed to start agent session:', error);
    return NextResponse.json(
      { error: 'Failed to start session' },
      { status: 500 }
    );
  }
}

/**
 * End an Agentforce session
 */
export async function DELETE(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const config = getConfigFromEnv();
    await endSession(config, sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to end agent session:', error);
    return NextResponse.json(
      { error: 'Failed to end session' },
      { status: 500 }
    );
  }
}
