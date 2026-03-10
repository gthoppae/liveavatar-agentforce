'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  LiveAvatarSession as Session,
  SessionState,
  SessionEvent,
  AgentEventsEnum,
  VoiceChatState,
  VoiceChatEvent,
  ConnectionQuality,
} from '@heygen/liveavatar-web-sdk';
import LatencyTimeline, { TimelineData } from './LatencyTimeline';
import { Translations } from '@/lib/translations';

interface Props {
  sessionToken: string;
  agentSessionId: string;
  mode: 'full' | 'custom';
  onDisconnect: () => void;
  onError?: (error: Error) => void;
  translations: Translations;
}

interface Message {
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

type ProcessingStep = 'stt' | 'agent' | 'tts' | 'avatar' | null;

export function LiveAvatarSession({
  sessionToken,
  agentSessionId,
  mode,
  onDisconnect,
  onError,
  translations: t,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const isProcessingRef = useRef(false);
  const initializedTokenRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Latency tracking refs
  const userSpeakEndTimeRef = useRef<number | null>(null);

  // State
  const [sessionState, setSessionState] = useState<SessionState>(SessionState.INACTIVE);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(ConnectionQuality.UNKNOWN);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>(VoiceChatState.INACTIVE);
  const [isMuted, setIsMuted] = useState(true);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);
  const isAvatarTalkingRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
  const [status, setStatus] = useState(t.initializing);
  const [messages, setMessages] = useState<Message[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send user message to Agentforce and have avatar speak response
  const handleUserTranscription = useCallback(async (text: string, sttDurationMs: number) => {
    // Prevent duplicate processing
    if (!text.trim() || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);
    setProcessingStep('agent');
    setStatus(t.processingAgentforce);
    setMessages(prev => [...prev, { role: 'user', text, timestamp: new Date() }]);

    const agentStartTime = Date.now();
    let agentDurationMs = 0;
    let ttsDurationMs = 0;
    let avatarDurationMs = 0;
    let ttsProvider = '';

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: agentSessionId,
        }),
      });

      agentDurationMs = Date.now() - agentStartTime;

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Agentforce request failed');
      }

      const data = await response.json();
      const agentResponse = data.text;

      if (!agentResponse) {
        console.warn('Empty response from Agentforce');
        setStatus(t.ready);
        return;
      }

      setMessages(prev => [...prev, { role: 'agent', text: agentResponse, timestamp: new Date() }]);

      if (sessionRef.current) {
        try {
          if (mode === 'custom') {
            // CUSTOM mode: Use external TTS (OpenAI or ElevenLabs) + repeatAudio
            setProcessingStep('tts');
            setStatus(t.generatingSpeech);
            const ttsStartTime = Date.now();

            const ttsRes = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: agentResponse, voice: 'alloy' }),
            });

            if (!ttsRes.ok) {
              throw new Error('TTS request failed');
            }

            const ttsData = await ttsRes.json();
            ttsDurationMs = Date.now() - ttsStartTime;
            ttsProvider = ttsData.provider || 'openai';

            console.log(`TTS audio received from ${ttsProvider}, calling repeatAudio()`);

            // Avatar rendering
            setProcessingStep('avatar');
            setStatus(t.avatarSpeaking);
            const avatarStartTime = Date.now();
            sessionRef.current.repeatAudio(ttsData.audioBase64);
            avatarDurationMs = Date.now() - avatarStartTime;
            console.log('session.repeatAudio() called successfully');
          } else {
            // FULL mode: Use LiveAvatar's built-in TTS (combined)
            setProcessingStep('avatar');
            setStatus(t.avatarSpeaking);
            const avatarStartTime = Date.now();
            await sessionRef.current.repeat(agentResponse);
            avatarDurationMs = Date.now() - avatarStartTime;
            console.log('session.repeat() completed successfully');
          }
        } catch (repeatError) {
          console.error('TTS/repeat failed:', repeatError);
          throw repeatError;
        }
      } else {
        console.warn('sessionRef.current is null, cannot speak');
      }

      // Build timeline data based on mode
      if (mode === 'custom') {
        // CUSTOM mode: Show separate TTS and Avatar segments
        const totalProcessingMs = sttDurationMs + agentDurationMs + ttsDurationMs + avatarDurationMs;
        const ttsServiceName = ttsProvider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI TTS';

        setTimelineData({
          segments: [
            {
              label: 'STT',
              service: 'HeyGen (Deepgram)',
              startMs: 0,
              durationMs: sttDurationMs,
              color: '#3b82f6', // blue
            },
            {
              label: 'Agent',
              service: 'Salesforce Agentforce',
              startMs: sttDurationMs,
              durationMs: agentDurationMs,
              color: '#eab308', // yellow
            },
            {
              label: 'TTS',
              service: ttsServiceName,
              startMs: sttDurationMs + agentDurationMs,
              durationMs: ttsDurationMs,
              color: '#a855f7', // purple
            },
            {
              label: 'Avatar',
              service: 'HeyGen Render',
              startMs: sttDurationMs + agentDurationMs + ttsDurationMs,
              durationMs: avatarDurationMs,
              color: '#f97316', // orange
            },
          ],
          totalProcessingMs,
        });
      } else {
        // FULL mode: Combined TTS + Avatar
        const totalProcessingMs = sttDurationMs + agentDurationMs + avatarDurationMs;
        setTimelineData({
          segments: [
            {
              label: 'STT',
              service: 'HeyGen (Deepgram)',
              startMs: 0,
              durationMs: sttDurationMs,
              color: '#3b82f6', // blue
            },
            {
              label: 'Agent',
              service: 'Salesforce Agentforce',
              startMs: sttDurationMs,
              durationMs: agentDurationMs,
              color: '#eab308', // yellow
            },
            {
              label: 'Avatar',
              service: 'HeyGen TTS + Render',
              startMs: sttDurationMs + agentDurationMs,
              durationMs: avatarDurationMs,
              color: '#f97316', // orange
            },
          ],
          totalProcessingMs,
        });
      }

    } catch (error) {
      console.error('Error processing message:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
      setStatus(t.errorProcessing);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setProcessingStep(null);
      if (!isAvatarTalkingRef.current) {
        setStatus(t.ready);
      }
    }
  }, [agentSessionId, mode, onError, t]);

  // Initialize session
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if (initializedTokenRef.current === sessionToken) {
      console.log('Session already initialized for this token, skipping');
      return;
    }
    initializedTokenRef.current = sessionToken;

    const session = new Session(sessionToken, {
      voiceChat: true,
    });
    sessionRef.current = session;

    // Session state events
    session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
      console.log('Session state changed:', state);
      setSessionState(state);
      if (state === SessionState.DISCONNECTED) {
        onDisconnect();
      }
    });

    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      console.log('Stream ready');
      setIsStreamReady(true);
      setStatus(t.connected);
      if (videoRef.current) {
        session.attach(videoRef.current);
      }
    });

    session.on(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED, (quality: ConnectionQuality) => {
      setConnectionQuality(quality);
    });

    // Voice chat events
    session.voiceChat.on(VoiceChatEvent.MUTED, () => {
      console.log('Voice chat muted');
      setIsMuted(true);
    });
    session.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
      console.log('Voice chat unmuted');
      setIsMuted(false);
    });
    session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (state: VoiceChatState) => {
      console.log('Voice chat state:', state);
      setVoiceChatState(state);
    });

    // Agent events - CRITICAL: Intercept transcription for Agentforce
    session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
      console.log('User started speaking');
      setIsUserTalking(true);
      setStatus(t.listening);
      setProcessingStep('stt');
    });

    session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
      console.log('User stopped speaking');
      setIsUserTalking(false);
      userSpeakEndTimeRef.current = Date.now();
    });

    session.on(AgentEventsEnum.USER_TRANSCRIPTION, async (event: { text: string }) => {
      console.log('User transcription:', event.text);

      // Calculate STT duration (time from speech end to transcription received)
      const sttDurationMs = userSpeakEndTimeRef.current
        ? Date.now() - userSpeakEndTimeRef.current
        : 500; // fallback estimate

      // FULL mode: Interrupt LiveAvatar's built-in AI before it responds
      // CUSTOM mode: No built-in AI, no need to interrupt
      if (mode === 'full') {
        try {
          await session.interrupt();
          console.log('Interrupted LiveAvatar AI');
        } catch (e) {
          console.log('Interrupt skipped (nothing playing)');
        }
      }
      // Send to Agentforce with STT timing
      handleUserTranscription(event.text, sttDurationMs);
    });

    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
      console.log('Avatar started speaking');
      isAvatarTalkingRef.current = true;
      setIsAvatarTalking(true);
      setStatus(t.avatarSpeaking);
    });

    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
      console.log('Avatar stopped speaking');
      isAvatarTalkingRef.current = false;
      setIsAvatarTalking(false);
      if (!isProcessingRef.current) {
        setStatus(t.ready);
      }
    });

    // Start session
    setStatus(t.startingSession);
    session.start().then(() => {
      console.log('Session started successfully');
    }).catch((error) => {
      console.error('Failed to start session:', error);
      onError?.(error);
      setStatus(t.failedToStart);
    });

    return () => {
      console.log('Cleaning up session...');
      session.stop().catch(console.error);
      session.removeAllListeners();
      session.voiceChat.removeAllListeners();
    };
  }, [sessionToken, mode, onDisconnect, onError, handleUserTranscription, t]);

  // Voice chat controls
  const startVoiceChat = async () => {
    try {
      await sessionRef.current?.voiceChat.start();
      console.log('Voice chat started');
    } catch (error) {
      console.error('Failed to start voice chat:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to start voice chat'));
    }
  };

  const stopVoiceChat = () => {
    try {
      sessionRef.current?.voiceChat.stop();
      console.log('Voice chat stopped');
    } catch (error) {
      console.error('Failed to stop voice chat:', error);
    }
  };

  const toggleMute = async () => {
    try {
      if (isMuted) {
        await sessionRef.current?.voiceChat.unmute();
      } else {
        await sessionRef.current?.voiceChat.mute();
      }
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    }
  };

  const interrupt = async () => {
    try {
      await sessionRef.current?.interrupt();
      setStatus(t.ready);
    } catch (error) {
      console.error('Failed to interrupt:', error);
    }
  };

  const isVoiceChatActive = voiceChatState === VoiceChatState.ACTIVE;

  return (
    <div className="flex flex-col gap-4">
      {/* Main content - side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Avatar + Controls */}
        <div className="space-y-4">
          {/* Video */}
          <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-900">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            <div className="absolute bottom-2 left-2 bg-black/50 text-white text-sm px-2 py-1 rounded">
              {status}
            </div>
            {isUserTalking && (
              <div className="absolute top-2 right-2 bg-green-500 text-white text-sm px-2 py-1 rounded animate-pulse">
                {t.listening}
              </div>
            )}
            {isAvatarTalking && (
              <div className="absolute top-2 right-2 bg-blue-500 text-white text-sm px-2 py-1 rounded animate-pulse">
                {t.speaking}
              </div>
            )}
            {isProcessing && !isAvatarTalking && (
              <div className="absolute top-2 right-2 bg-yellow-500 text-white text-sm px-2 py-1 rounded animate-pulse">
                {t.processing}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-2 flex-wrap justify-center">
            {!isVoiceChatActive ? (
              <button
                onClick={startVoiceChat}
                disabled={!isStreamReady}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t.startVoiceChat}
              </button>
            ) : (
              <>
                <button
                  onClick={stopVoiceChat}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  {t.stopVoiceChat}
                </button>
                <button
                  onClick={toggleMute}
                  className={`px-4 py-2 rounded transition-colors ${
                    isMuted
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-green-600 hover:bg-green-700'
                  } text-white`}
                >
                  {isMuted ? t.unmute : t.mute}
                </button>
              </>
            )}
            <button
              onClick={interrupt}
              disabled={!isAvatarTalking}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t.interrupt}
            </button>
          </div>

          {/* Connection info */}
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
            {t.mode}: {mode.toUpperCase()} | {t.session}: {sessionState} | {t.quality}: {connectionQuality}
            {isVoiceChatActive && ` | ${t.voice}: ${isMuted ? t.muted : t.active}`}
          </div>
        </div>

        {/* Right: Conversation - fixed height to keep latency visible */}
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 shadow-sm dark:shadow-none flex flex-col h-[350px]">
          <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white flex-shrink-0">{t.conversation}</h2>
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
            {messages.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-center py-8">
                {t.noMessagesYet}
              </p>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                      msg.role === 'user' ? 'bg-blue-500' : 'bg-green-500'
                    }`}
                  >
                    {msg.role === 'user' ? 'U' : 'A'}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <div className="text-xs font-semibold mb-1 opacity-70">
                      {msg.role === 'user' ? t.you : t.agent}
                    </div>
                    <div>{msg.text}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Latency Timeline */}
      <LatencyTimeline
        data={timelineData}
        isProcessing={isProcessing}
        currentStep={processingStep}
      />
    </div>
  );
}
