import { NextRequest, NextResponse } from 'next/server';
import { apiGuard } from '@/lib/apiGuard';
import {
  sendMessage,
  extractTextResponse,
  getConfigFromEnv,
} from '@/lib/agentforce';

/**
 * Send a message to the Agentforce agent and get the response
 */
export async function POST(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  try {
    const body = await request.json();
    const { message, sessionId } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      );
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    console.log('>>> Sending to agent:', { message, sessionId });

    const config = getConfigFromEnv();
    const response = await sendMessage(config, sessionId, message);
    const text = extractTextResponse(response);

    console.log('<<< Agent response:', { text, status: response.status });

    return NextResponse.json({
      text,
      status: response.status,
    });
  } catch (error) {
    console.error('Agent message error:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}
