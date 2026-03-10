'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveAvatarSession } from '@/components/LiveAvatarSession';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import SiteHeader from '@/components/SiteHeader';
import { sanitizeUrl, sanitizeColor } from '@/lib/sanitize';
import { getTranslations, Translations } from '@/lib/translations';

function SiteHeaderWithParams() {
  const searchParams = useSearchParams();
  const site = searchParams.get('site') || process.env.NEXT_PUBLIC_DEFAULT_SITE || null;
  const logoUrl = sanitizeUrl(searchParams.get('logo'), '');
  const logoAlt = searchParams.get('logoAlt');
  const homeUrl = sanitizeUrl(searchParams.get('homeUrl'), '/');
  const primaryColor = sanitizeColor(searchParams.get('color'));
  return (
    <SiteHeader
      site={site}
      logoUrl={logoUrl}
      logoAlt={logoAlt}
      homeUrl={homeUrl}
      primaryColor={primaryColor}
    />
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const lang = searchParams.get('lang') || process.env.NEXT_PUBLIC_DEFAULT_LANG || null;
  const t = getTranslations(lang);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'full' | 'custom'>('full');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // 0. Request microphone permission first (before SDK tries)
      console.log('Requesting microphone permission...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const track = stream.getAudioTracks()[0];
        console.log('Microphone access granted:', track.label, track.muted ? '(muted)' : '(active)');
        // Stop the test stream - SDK will request its own
        stream.getTracks().forEach(t => t.stop());
      } catch (micError) {
        console.error('Microphone permission denied:', micError);
        throw new Error(t.microphoneRequired);
      }

      // 1. Get LiveAvatar session token
      console.log('Getting LiveAvatar token...');
      const tokenRes = await fetch('/api/liveavatar/token', { method: 'POST' });
      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || 'Failed to get LiveAvatar token');
      }
      const { session_token, mode: sessionMode } = await tokenRes.json();
      console.log('Got LiveAvatar token, mode:', sessionMode);

      // 2. Start Agentforce session
      console.log('Starting Agentforce session...');
      const agentRes = await fetch('/api/agent/session', { method: 'POST' });
      if (!agentRes.ok) {
        const err = await agentRes.json();
        throw new Error(err.error || 'Failed to start Agentforce session');
      }
      const { sessionId } = await agentRes.json();
      console.log('Agentforce session started:', sessionId);

      setSessionToken(session_token);
      setAgentSessionId(sessionId);
      setMode(sessionMode || 'full');
    } catch (err) {
      console.error('Connection error:', err);
      setError(err instanceof Error ? err.message : t.connectionFailed);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    console.log('Disconnecting...');

    // End Agentforce session
    if (agentSessionId) {
      try {
        await fetch('/api/agent/session', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: agentSessionId }),
        });
        console.log('Agentforce session ended');
      } catch (err) {
        console.error('Error ending Agentforce session:', err);
      }
    }

    setSessionToken(null);
    setAgentSessionId(null);
    setError(null);
  };

  const handleError = (err: Error) => {
    console.error('Session error:', err);
    setError(err.message);
  };

  const isConnected = sessionToken && agentSessionId;

  return (
    <main className="min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
            {t.pageTitle}
          </h1>
          <ThemeSwitcher />
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Main content */}
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-12 gap-6">
            <div className="text-center max-w-md">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t.voiceEnabledAvatar}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {t.voiceEnabledDescription}
              </p>
            </div>

            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="px-8 py-4 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-lg"
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t.connecting}
                </span>
              ) : (
                t.connect
              )}
            </button>

            <p className="text-sm text-gray-500 dark:text-gray-500">
              {t.apiKeysNote}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <LiveAvatarSession
              sessionToken={sessionToken}
              agentSessionId={agentSessionId}
              mode={mode}
              onDisconnect={handleDisconnect}
              onError={handleError}
              translations={t}
            />

            <div className="flex justify-center">
              <button
                onClick={handleDisconnect}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                {t.disconnect}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500 dark:text-gray-500">
          {t.poweredBy}
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <SiteHeaderWithParams />
      </Suspense>
      <Suspense fallback={<div className="min-h-screen p-4 sm:p-8" />}>
        <HomeContent />
      </Suspense>
    </>
  );
}
