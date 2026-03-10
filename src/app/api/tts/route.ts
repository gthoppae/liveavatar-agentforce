import { NextRequest, NextResponse } from 'next/server';
import { apiGuard } from '@/lib/apiGuard';

/**
 * Text-to-speech API supporting multiple providers
 * Returns PCM 24kHz audio for LiveAvatar repeatAudio()
 *
 * Provider selection via TTS_PROVIDER env var:
 * - 'openai' (default): OpenAI TTS
 * - 'elevenlabs': ElevenLabs TTS
 */
export async function POST(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  const ttsProvider = (process.env.TTS_PROVIDER || 'openai').toLowerCase();

  try {
    const { text, voice } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    let audioBuffer: ArrayBuffer;

    if (ttsProvider === 'elevenlabs') {
      // ElevenLabs TTS
      const apiKey = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID;

      if (!apiKey || !voiceId) {
        return NextResponse.json(
          { error: 'ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID required' },
          { status: 500 }
        );
      }

      console.log('Using ElevenLabs TTS, voice:', voiceId);

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            output_format: 'pcm_24000', // PCM 24kHz - matches repeatAudio() requirements
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs TTS error:', errorText);
        return NextResponse.json(
          { error: 'ElevenLabs TTS failed' },
          { status: response.status }
        );
      }

      audioBuffer = await response.arrayBuffer();
    } else {
      // OpenAI TTS (default)
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return NextResponse.json(
          { error: 'OPENAI_API_KEY not configured' },
          { status: 500 }
        );
      }

      const openaiVoice = voice || 'alloy';
      console.log('Using OpenAI TTS, voice:', openaiVoice);

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: openaiVoice, // alloy, echo, fable, onyx, nova, shimmer
          response_format: 'pcm', // Raw PCM at 24kHz, 16-bit signed, little-endian
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI TTS error:', errorText);
        return NextResponse.json(
          { error: 'OpenAI TTS failed' },
          { status: response.status }
        );
      }

      audioBuffer = await response.arrayBuffer();
    }

    // Convert to base64
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    console.log('TTS generated:', {
      provider: ttsProvider,
      textLength: text.length,
      audioBytes: audioBuffer.byteLength,
    });

    return NextResponse.json({
      audioBase64,
      format: 'pcm_24k_16bit_mono',
      provider: ttsProvider,
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json(
      { error: 'TTS failed' },
      { status: 500 }
    );
  }
}
