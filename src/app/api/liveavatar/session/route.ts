import { NextRequest, NextResponse } from 'next/server';
import { apiGuard } from '@/lib/apiGuard';
import { getSession, removeSession, getAllSessions, clearAllSessions } from '@/lib/sessionStore';

const API_URL = process.env.LIVEAVATAR_API_URL || 'https://api.liveavatar.com';

/**
 * GET - List all stored sessions
 */
export async function GET(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  const sessions = getAllSessions();
  return NextResponse.json({
    count: sessions.length,
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      createdAt: s.createdAt,
    })),
  });
}

/**
 * DELETE - Terminate a specific session or all sessions
 * Body: { sessionId?: string, all?: boolean }
 */
export async function DELETE(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId, all } = body;

    // Terminate all sessions
    if (all) {
      const sessions = getAllSessions();
      const results = await Promise.all(
        sessions.map(async (session) => {
          const success = await terminateSession(session.sessionToken);
          if (success) {
            removeSession(session.sessionId);
          }
          return { sessionId: session.sessionId, success };
        })
      );
      clearAllSessions();
      return NextResponse.json({
        message: 'Terminated all sessions',
        results,
      });
    }

    // Terminate specific session
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required (or set all: true)' },
        { status: 400 }
      );
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found in store' },
        { status: 404 }
      );
    }

    const success = await terminateSession(session.sessionToken);
    if (success) {
      removeSession(sessionId);
    }

    return NextResponse.json({
      success,
      message: success ? 'Session terminated' : 'Failed to terminate session',
    });
  } catch (error) {
    console.error('Error terminating session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to terminate session' },
      { status: 500 }
    );
  }
}

async function terminateSession(sessionToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/v1/sessions`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to terminate session:', response.status, errorData);
      return false;
    }

    console.log('Session terminated successfully');
    return true;
  } catch (error) {
    console.error('Error terminating session:', error);
    return false;
  }
}
