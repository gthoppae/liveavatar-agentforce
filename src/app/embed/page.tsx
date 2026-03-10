'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveAvatarSession } from '@/components/LiveAvatarSession';
import { getTranslations } from '@/lib/translations';
import { sanitizeColor } from '@/lib/sanitize';

function EmbedContent() {
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || process.env.NEXT_PUBLIC_DEFAULT_LANG || null;
  const primaryColor = sanitizeColor(searchParams.get('color'), '#0077b6');
  const t = getTranslations(lang);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'full' | 'custom'>('full');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  // Listen for restore message from parent (proxy page)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'avatar-widget-restore') {
        setIsMinimized(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Request microphone permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (micError) {
        throw new Error(t.microphoneRequired);
      }

      // Get LiveAvatar session token
      const tokenRes = await fetch('/api/liveavatar/token', { method: 'POST' });
      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'Failed to get LiveAvatar token');
      }
      const { session_token, mode: sessionMode } = await tokenRes.json();

      // Start Agentforce session
      const agentRes = await fetch('/api/agent/session', { method: 'POST' });
      if (!agentRes.ok) {
        const err = await agentRes.json();
        throw new Error(err.error || 'Failed to start Agentforce session');
      }
      const { sessionId } = await agentRes.json();

      setSessionToken(session_token);
      setAgentSessionId(sessionId);
      setMode(sessionMode || 'full');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.connectionFailed);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (agentSessionId) {
      try {
        await fetch('/api/agent/session', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: agentSessionId }),
        });
      } catch (err) {
        console.error('Error ending Agentforce session:', err);
      }
    }
    setSessionToken(null);
    setAgentSessionId(null);
    setError(null);
  };

  const handleError = (err: Error) => {
    setError(err.message);
  };

  const isConnected = sessionToken && agentSessionId;

  // Minimized state - just show a button
  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-0 p-4">
        <button
          onClick={() => {
            window.parent.postMessage({ type: 'avatar-widget-restore' }, '*');
            setIsMinimized(false);
          }}
          style={{ backgroundColor: primaryColor }}
          className="w-14 h-14 rounded-full text-white shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2 text-white text-sm"
        style={{ backgroundColor: primaryColor }}
      >
        <span className="font-medium">AI Assistant</span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              window.parent.postMessage({ type: 'avatar-widget-minimize' }, '*');
              setIsMinimized(true);
            }}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Minimize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
            </svg>
          </button>
          {isConnected && (
            <button
              onClick={handleDisconnect}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title="Disconnect"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-2 mt-2 p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {!isConnected ? (
          <div className="h-full flex flex-col items-center justify-center p-4 gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="text-center">
              <h2 className="text-base font-medium text-gray-900 dark:text-white mb-1">
                {t.voiceEnabledAvatar}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t.voiceEnabledDescription}
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              style={{ backgroundColor: isConnecting ? '#9ca3af' : primaryColor }}
              className="px-6 py-3 text-white font-medium rounded-lg hover:opacity-90 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t.connecting}
                </span>
              ) : (
                t.connect
              )}
            </button>
          </div>
        ) : (
          <div className="h-full">
            <EmbedAvatarSession
              sessionToken={sessionToken}
              agentSessionId={agentSessionId}
              mode={mode}
              onDisconnect={handleDisconnect}
              onError={handleError}
              translations={t}
              primaryColor={primaryColor}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Compact version of LiveAvatarSession for embed
import { useRef, useCallback } from 'react';
import {
  LiveAvatarSession as Session,
  SessionState,
  SessionEvent,
  AgentEventsEnum,
  VoiceChatState,
  VoiceChatEvent,
} from '@heygen/liveavatar-web-sdk';
import { Translations } from '@/lib/translations';

interface EmbedSessionProps {
  sessionToken: string;
  agentSessionId: string;
  mode: 'full' | 'custom';
  onDisconnect: () => void;
  onError?: (error: Error) => void;
  translations: Translations;
  primaryColor: string;
}

function EmbedAvatarSession({
  sessionToken,
  agentSessionId,
  mode,
  onDisconnect,
  onError,
  translations: t,
  primaryColor,
}: EmbedSessionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const isProcessingRef = useRef(false);
  const initializedTokenRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userSpeakEndTimeRef = useRef<number | null>(null);

  const [sessionState, setSessionState] = useState<SessionState>(SessionState.INACTIVE);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>(VoiceChatState.INACTIVE);
  const [isMuted, setIsMuted] = useState(true);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);
  const isAvatarTalkingRef = useRef(false);
  const [status, setStatus] = useState(t.initializing);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleUserTranscription = useCallback(async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setStatus(t.processingAgentforce);
    setMessages(prev => [...prev, { role: 'user', text }]);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: agentSessionId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Agentforce request failed');
      }

      const data = await response.json();
      const agentResponse = data.text;

      if (!agentResponse) {
        setStatus(t.ready);
        return;
      }

      setMessages(prev => [...prev, { role: 'agent', text: agentResponse }]);

      if (sessionRef.current) {
        if (mode === 'custom') {
          setStatus(t.generatingSpeech);
          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: agentResponse, voice: 'alloy' }),
          });
          if (!ttsRes.ok) throw new Error('TTS request failed');
          const ttsData = await ttsRes.json();
          setStatus(t.avatarSpeaking);
          sessionRef.current.repeatAudio(ttsData.audioBase64);
        } else {
          setStatus(t.avatarSpeaking);
          await sessionRef.current.repeat(agentResponse);
        }
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      setStatus(t.errorProcessing);
    } finally {
      isProcessingRef.current = false;
      if (!isAvatarTalkingRef.current) setStatus(t.ready);
    }
  }, [agentSessionId, mode, onError, t]);

  useEffect(() => {
    if (initializedTokenRef.current === sessionToken) return;
    initializedTokenRef.current = sessionToken;

    const session = new Session(sessionToken, { voiceChat: true });
    sessionRef.current = session;

    session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
      setSessionState(state);
      if (state === SessionState.DISCONNECTED) onDisconnect();
    });

    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      setIsStreamReady(true);
      setStatus(t.connected);
      if (videoRef.current) session.attach(videoRef.current);
    });

    session.voiceChat.on(VoiceChatEvent.MUTED, () => setIsMuted(true));
    session.voiceChat.on(VoiceChatEvent.UNMUTED, () => setIsMuted(false));
    session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (state: VoiceChatState) => setVoiceChatState(state));

    session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
      setIsUserTalking(true);
      setStatus(t.listening);
    });
    session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
      setIsUserTalking(false);
      userSpeakEndTimeRef.current = Date.now();
    });
    session.on(AgentEventsEnum.USER_TRANSCRIPTION, async (event: { text: string }) => {
      if (mode === 'full') {
        try { await session.interrupt(); } catch {}
      }
      handleUserTranscription(event.text);
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
      isAvatarTalkingRef.current = true;
      setIsAvatarTalking(true);
      setStatus(t.avatarSpeaking);
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
      isAvatarTalkingRef.current = false;
      setIsAvatarTalking(false);
      if (!isProcessingRef.current) setStatus(t.ready);
    });

    setStatus(t.startingSession);
    session.start().catch((error) => {
      onError?.(error);
      setStatus(t.failedToStart);
    });

    return () => {
      session.stop().catch(console.error);
      session.removeAllListeners();
      session.voiceChat.removeAllListeners();
    };
  }, [sessionToken, mode, onDisconnect, onError, handleUserTranscription, t]);

  const startVoiceChat = async () => {
    try { await sessionRef.current?.voiceChat.start(); } catch (e) { onError?.(e as Error); }
  };
  const toggleMute = async () => {
    try { if (isMuted) await sessionRef.current?.voiceChat.unmute(); else await sessionRef.current?.voiceChat.mute(); } catch {}
  };
  const interrupt = async () => {
    try { await sessionRef.current?.interrupt(); setStatus(t.ready); } catch {}
  };

  const isVoiceChatActive = voiceChatState === VoiceChatState.ACTIVE;

  return (
    <div className="h-full flex flex-col">
      {/* Avatar video */}
      <div className="relative aspect-video bg-gray-900 flex-shrink-0">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
          {status}
        </div>
        {isUserTalking && (
          <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-2 py-0.5 rounded animate-pulse">
            {t.listening}
          </div>
        )}
        {isAvatarTalking && (
          <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded animate-pulse">
            {t.speaking}
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0 bg-gray-50 dark:bg-gray-800">
        {messages.length === 0 ? (
          <p className="text-gray-400 text-xs text-center py-4">{t.noMessagesYet}</p>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              }`}>
                {msg.text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Controls */}
      <div className="flex gap-1 p-2 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        {!isVoiceChatActive ? (
          <button
            onClick={startVoiceChat}
            disabled={!isStreamReady}
            style={{ backgroundColor: primaryColor }}
            className="flex-1 py-2 text-white text-sm rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t.startVoiceChat}
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`flex-1 py-2 text-white text-sm rounded transition-colors ${
                isMuted ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {isMuted ? t.unmute : t.mute}
            </button>
            {isAvatarTalking && (
              <button
                onClick={interrupt}
                className="px-3 py-2 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 transition-colors"
              >
                {t.interrupt}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-white" />}>
      <EmbedContent />
    </Suspense>
  );
}
