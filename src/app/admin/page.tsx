'use client';

import { useState, useEffect, useRef } from 'react';

interface ConfigItem {
  key: string;
  value: string;
  masked: string;
  isSecret: boolean;
}

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

type Tab = 'config' | 'avatars' | 'voices' | 'contexts';

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('config');

  // Config state
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [editedConfigs, setEditedConfigs] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState('');
  const [configReadonly, setConfigReadonly] = useState(false);
  const [configProvider, setConfigProvider] = useState('');

  // LiveAvatar state
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [currentAvatar, setCurrentAvatar] = useState('');
  const [currentVoice, setCurrentVoice] = useState('');
  const [currentContext, setCurrentContext] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedContext, setSelectedContext] = useState('');
  const [resourceLoading, setResourceLoading] = useState(false);

  // Audio preview
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/auth')
      .then(res => { if (res.ok) setAuthenticated(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadConfigs();
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated && activeTab !== 'config') {
      loadResources(activeTab);
    }
  }, [authenticated, activeTab]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        setAuthenticated(true);
        setPassword('');
      } else {
        setAuthError(data.error || 'Invalid password');
      }
    } catch {
      setAuthError('Authentication failed');
    }
  }

  async function loadConfigs() {
    setConfigLoading(true);
    try {
      const res = await fetch('/api/admin/config');
      if (res.status === 401) { setAuthenticated(false); return; }
      const data = await res.json();

      if (data.configs) {
        setConfigs(data.configs);
        // Initialize edited values
        const edited: Record<string, string> = {};
        for (const config of data.configs) {
          edited[config.key] = config.isSecret ? '' : config.value;
        }
        setEditedConfigs(edited);

        // Set selected values from current config
        const avatarConfig = data.configs.find((c: ConfigItem) => c.key === 'LIVEAVATAR_AVATAR_ID');
        const voiceConfig = data.configs.find((c: ConfigItem) => c.key === 'LIVEAVATAR_VOICE_ID');
        const contextConfig = data.configs.find((c: ConfigItem) => c.key === 'LIVEAVATAR_CONTEXT_ID');

        if (avatarConfig) { setCurrentAvatar(avatarConfig.value); setSelectedAvatar(avatarConfig.value); }
        if (voiceConfig) { setCurrentVoice(voiceConfig.value); setSelectedVoice(voiceConfig.value); }
        if (contextConfig) { setCurrentContext(contextConfig.value); setSelectedContext(contextConfig.value); }

        if (data.readonly !== undefined) setConfigReadonly(data.readonly);
        if (data.provider) setConfigProvider(data.provider);
      }
    } catch (error) {
      console.error('Failed to load configs:', error);
    } finally {
      setConfigLoading(false);
    }
  }

  async function saveConfigs() {
    setConfigSaving(true);
    setConfigMessage('');

    try {
      const configsToSave = Object.entries(editedConfigs)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => ({ key, value }));

      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: configsToSave }),
      });

      if (res.status === 401) { setAuthenticated(false); return; }
      const data = await res.json();

      if (data.success) {
        setConfigMessage('Configuration saved! App will restart...');
        // Reload configs after a delay
        setTimeout(() => {
          loadConfigs();
          setConfigMessage('');
        }, 3000);
      } else {
        setConfigMessage('Error: ' + (data.error || 'Failed to save'));
      }
    } catch {
      setConfigMessage('Error: Failed to save configuration');
    } finally {
      setConfigSaving(false);
    }
  }

  async function loadResources(type: 'avatars' | 'voices' | 'contexts') {
    setResourceLoading(true);
    try {
      const res = await fetch(`/api/admin/liveavatar?type=${type}`);
      if (res.status === 401) { setAuthenticated(false); return; }
      const data = await res.json();

      if (type === 'avatars' && data.avatars) {
        setAvatars(data.avatars);
      } else if (type === 'voices' && data.voices) {
        setVoices(data.voices);
      } else if (type === 'contexts' && data.contexts) {
        setContexts(data.contexts);
      }
    } catch (error) {
      console.error(`Failed to load ${type}:`, error);
    } finally {
      setResourceLoading(false);
    }
  }

  function handleConfigChange(key: string, value: string) {
    setEditedConfigs((prev) => ({ ...prev, [key]: value }));
  }

  function toggleShowSecret(key: string) {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function applySelection(type: 'avatar' | 'voice' | 'context') {
    const configs: { key: string; value: string }[] = [];

    if (type === 'avatar') {
      if (!selectedAvatar) return;
      configs.push({ key: 'LIVEAVATAR_AVATAR_ID', value: selectedAvatar });
      // Also apply the paired voice
      if (selectedVoice) {
        configs.push({ key: 'LIVEAVATAR_VOICE_ID', value: selectedVoice });
      }
    } else if (type === 'voice') {
      if (!selectedVoice) return;
      configs.push({ key: 'LIVEAVATAR_VOICE_ID', value: selectedVoice });
    } else {
      if (!selectedContext) return;
      configs.push({ key: 'LIVEAVATAR_CONTEXT_ID', value: selectedContext });
    }

    setConfigSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs }),
      });

      const data = await res.json();
      if (data.success) {
        const label = type === 'avatar' ? 'Avatar + voice' : type;
        setConfigMessage(`${label} updated! App will restart...`);
        setTimeout(() => {
          loadConfigs();
          setConfigMessage('');
        }, 3000);
      }
    } catch {
      setConfigMessage('Error: Failed to apply selection');
    } finally {
      setConfigSaving(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function playVoicePreview(voiceId: string, audioUrl?: string) {
    if (!audioUrl) return;

    if (playingVoice === voiceId) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setPlayingVoice(voiceId);
    }
  }

  // Password gate
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">Admin Access</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full px-4 py-3 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none mb-4"
              autoFocus
            />
            {authError && (
              <p className="text-red-400 text-sm mb-4">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Admin Configuration</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['config', 'avatars', /* 'voices', */ 'contexts'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Config Tab */}
        {activeTab === 'config' && (
          <div className="bg-gray-800 rounded-lg p-6">
            {configLoading ? (
              <p className="text-gray-400">Loading configuration...</p>
            ) : (
              <>
                <div className="space-y-4">
                  {configs.map((config) => (
                    <div key={config.key} className="flex items-center gap-3">
                      <label className="w-48 text-gray-300 text-sm font-mono">
                        {config.key}
                      </label>
                      <div className="flex-1 relative">
                        <input
                          type={config.isSecret && !showSecrets[config.key] ? 'password' : 'text'}
                          value={
                            config.isSecret
                              ? editedConfigs[config.key] || ''
                              : editedConfigs[config.key] ?? config.value
                          }
                          onChange={(e) => handleConfigChange(config.key, e.target.value)}
                          placeholder={config.isSecret ? config.masked : ''}
                          className="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none font-mono text-sm"
                        />
                        {config.isSecret && (
                          <button
                            type="button"
                            onClick={() => toggleShowSecret(config.key)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                          >
                            {showSecrets[config.key] ? '🙈' : '👁'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-4">
                  {!configReadonly && (
                    <button
                      onClick={saveConfigs}
                      disabled={configSaving}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium"
                    >
                      {configSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}
                  {configMessage && (
                    <p className={`text-sm ${configMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                      {configMessage}
                    </p>
                  )}
                </div>

                {configReadonly ? (
                  <div className="mt-4 p-4 bg-gray-700/50 rounded-lg text-sm space-y-3">
                    <p className="text-blue-400 font-medium">Configuration is read-only for security</p>
                    <p className="text-gray-300">
                      Environment variables cannot be edited from the browser. Update them via your deployment platform and restart the app.
                    </p>
                    <details className="text-gray-300">
                      <summary className="cursor-pointer text-blue-400 hover:text-blue-300 font-medium">How to update configuration by platform</summary>
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-gray-200 font-medium">Local development</p>
                          <pre className="bg-gray-900 p-2 rounded text-gray-300 text-xs mt-1 overflow-x-auto">{`# Edit .env.local, then restart:
npm run dev`}</pre>
                        </div>
                        <div>
                          <p className="text-gray-200 font-medium">Docker</p>
                          <pre className="bg-gray-900 p-2 rounded text-gray-300 text-xs mt-1 overflow-x-auto">{`# Edit .env.local (no quotes, no inline #comments), then:
docker compose up --build
# or:  docker run --env-file .env.local ...`}</pre>
                        </div>
                        <div>
                          <p className="text-gray-200 font-medium">Heroku</p>
                          <pre className="bg-gray-900 p-2 rounded text-gray-300 text-xs mt-1 overflow-x-auto">{`heroku config:set KEY=value -a your-app-name
# To enable editing from this UI, set:
#   HEROKU_API_KEY, HEROKU_APP_NAME, ADMIN_PASSWORD`}</pre>
                        </div>
                        <div>
                          <p className="text-gray-200 font-medium">AWS (ECS / App Runner / Elastic Beanstalk)</p>
                          <pre className="bg-gray-900 p-2 rounded text-gray-300 text-xs mt-1 overflow-x-auto">{`# ECS: Update task definition environment variables
aws ecs update-service --force-new-deployment ...

# App Runner: Update service configuration
aws apprunner update-service ...

# Elastic Beanstalk: Environment properties
eb setenv KEY=value

# For secrets, use AWS Secrets Manager or SSM Parameter Store`}</pre>
                        </div>
                        <div>
                          <p className="text-gray-200 font-medium">Other platforms</p>
                          <p className="text-gray-400 text-xs mt-1">Set environment variables via your platform&apos;s dashboard or CLI, then redeploy or restart the service.</p>
                        </div>
                      </div>
                    </details>
                  </div>
                ) : (
                  <p className="mt-4 text-yellow-500 text-sm">
                    Saving will restart the app. Changes take effect after restart.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Avatars Tab */}
        {activeTab === 'avatars' && (
          <div className="bg-gray-800 rounded-lg p-6">
            {resourceLoading ? (
              <p className="text-gray-400">Loading avatars...</p>
            ) : avatars.length === 0 ? (
              <p className="text-gray-400">No avatars found</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {[...avatars].sort((a, b) => {
                    if (a.avatar_id === currentAvatar) return -1;
                    if (b.avatar_id === currentAvatar) return 1;
                    return 0;
                  }).map((avatar) => (
                    <div
                      key={avatar.avatar_id}
                      onClick={() => {
                        setSelectedAvatar(avatar.avatar_id);
                        if (avatar.default_voice) {
                          setSelectedVoice(avatar.default_voice.id);
                        }
                      }}
                      className={`relative cursor-pointer rounded-lg p-3 border-2 transition-colors ${
                        selectedAvatar === avatar.avatar_id
                          ? 'border-blue-500 bg-blue-500/20'
                          : avatar.avatar_id === currentAvatar
                            ? 'border-green-500/50 bg-green-500/10'
                            : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      {avatar.avatar_id === currentAvatar && (
                        <span className="absolute top-1 right-1 bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          CURRENT
                        </span>
                      )}
                      {avatar.preview_url || avatar.thumbnail_url ? (
                        <img
                          src={avatar.preview_url || avatar.thumbnail_url}
                          alt={avatar.name}
                          className="w-full aspect-square object-cover rounded-lg mb-2"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-gray-700 rounded-lg mb-2 flex items-center justify-center text-4xl">
                          👤
                        </div>
                      )}
                      <p className="text-white text-sm text-center truncate">{avatar.name}</p>
                      {avatar.default_voice && (
                        <p className="text-gray-400 text-xs text-center truncate">Voice: {avatar.default_voice.name}</p>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(avatar.avatar_id); }}
                        className="text-gray-500 text-xs text-center truncate hover:text-blue-400 cursor-pointer w-full"
                        title="Click to copy ID"
                      >
                        {copiedId === avatar.avatar_id ? 'Copied!' : avatar.avatar_id}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-2">
                  <div className="flex items-center gap-4">
                    <p className="text-gray-300">
                      Selected: <span className="font-mono text-blue-400">{selectedAvatar ? avatars.find(a => a.avatar_id === selectedAvatar)?.name || selectedAvatar : 'None'}</span>
                    </p>
                    {!configReadonly ? (
                      <button
                        onClick={() => applySelection('avatar')}
                        disabled={!selectedAvatar || configSaving}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium"
                      >
                        Apply Avatar + Voice
                      </button>
                    ) : selectedAvatar && (
                      <button
                        onClick={() => {
                          const avatarName = avatars.find(a => a.avatar_id === selectedAvatar)?.name || '';
                          const voiceName = voices.find(v => v.voice_id === selectedVoice)?.name || '';
                          const lines = [`LIVEAVATAR_AVATAR_ID=${selectedAvatar}${avatarName ? ` #${avatarName}` : ''}`];
                          if (selectedVoice) lines.push(`LIVEAVATAR_VOICE_ID=${selectedVoice}${voiceName ? ` #${voiceName}` : ''}`);
                          copyToClipboard(lines.join('\n'));
                        }}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-mono"
                      >
                        {copiedId?.startsWith('LIVEAVATAR_AVATAR_ID=') ? 'Copied!' : 'Copy avatar + voice for .env.local'}
                      </button>
                    )}
                  </div>
                  {selectedAvatar && selectedVoice && (
                    <p className="text-gray-400 text-sm">
                      Paired voice: <span className="text-blue-400">{voices.find(v => v.voice_id === selectedVoice)?.name || selectedVoice}</span>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Voices Tab */}
        {activeTab === 'voices' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <audio ref={audioRef} onEnded={() => setPlayingVoice(null)} />

            {resourceLoading ? (
              <p className="text-gray-400">Loading voices...</p>
            ) : voices.length === 0 ? (
              <p className="text-gray-400">No voices found</p>
            ) : (
              <>
                <div className="space-y-2">
                  {[...voices].sort((a, b) => {
                    if (a.voice_id === currentVoice) return -1;
                    if (b.voice_id === currentVoice) return 1;
                    return 0;
                  }).map((voice) => (
                    <div
                      key={voice.voice_id}
                      onClick={() => setSelectedVoice(voice.voice_id)}
                      className={`cursor-pointer rounded-lg p-4 border-2 transition-colors flex items-center gap-4 ${
                        selectedVoice === voice.voice_id
                          ? 'border-blue-500 bg-blue-500/20'
                          : voice.voice_id === currentVoice
                            ? 'border-green-500/50 bg-green-500/10'
                            : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium">{voice.name}</p>
                          {voice.voice_id === currentVoice && (
                            <span className="bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                              CURRENT
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm">
                          {voice.language} • {voice.gender}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(voice.voice_id); }}
                          className="text-gray-500 text-xs font-mono hover:text-blue-400 cursor-pointer"
                          title="Click to copy ID"
                        >
                          {copiedId === voice.voice_id ? 'Copied!' : voice.voice_id}
                        </button>
                      </div>

                      {voice.preview_audio_url && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playVoicePreview(voice.voice_id, voice.preview_audio_url);
                          }}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
                        >
                          {playingVoice === voice.voice_id ? '⏹️ Stop' : '▶️ Play'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-4">
                  <p className="text-gray-300">
                    Selected: <span className="font-mono text-blue-400">{selectedVoice || 'None'}</span>
                  </p>
                  {!configReadonly ? (
                    <button
                      onClick={() => applySelection('voice')}
                      disabled={!selectedVoice || configSaving}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium"
                    >
                      Apply Selection
                    </button>
                  ) : selectedVoice && (
                    <button
                      onClick={() => {
                        const vName = voices.find(v => v.voice_id === selectedVoice)?.name || '';
                        copyToClipboard(`LIVEAVATAR_VOICE_ID=${selectedVoice}${vName ? ` #${vName}` : ''}`);
                      }}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-mono"
                    >
                      {copiedId === `LIVEAVATAR_VOICE_ID=${selectedVoice}` ? 'Copied!' : 'Copy for .env.local'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Contexts Tab */}
        {activeTab === 'contexts' && (
          <div className="bg-gray-800 rounded-lg p-6">
            {resourceLoading ? (
              <p className="text-gray-400">Loading contexts...</p>
            ) : contexts.length === 0 ? (
              <p className="text-gray-400">No contexts found</p>
            ) : (
              <>
                <div className="space-y-2">
                  {[...contexts].sort((a, b) => {
                    if (a.context_id === currentContext) return -1;
                    if (b.context_id === currentContext) return 1;
                    return 0;
                  }).map((context) => (
                    <div
                      key={context.context_id}
                      onClick={() => setSelectedContext(context.context_id)}
                      className={`cursor-pointer rounded-lg p-4 border-2 transition-colors ${
                        selectedContext === context.context_id
                          ? 'border-blue-500 bg-blue-500/20'
                          : context.context_id === currentContext
                            ? 'border-green-500/50 bg-green-500/10'
                            : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium">{context.name}</p>
                        {context.context_id === currentContext && (
                          <span className="bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            CURRENT
                          </span>
                        )}
                      </div>
                      {context.description && (
                        <p className="text-gray-400 text-sm mt-1">{context.description}</p>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(context.context_id); }}
                        className="text-gray-500 text-xs font-mono mt-1 hover:text-blue-400 cursor-pointer"
                        title="Click to copy ID"
                      >
                        {copiedId === context.context_id ? 'Copied!' : context.context_id}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-4">
                  <p className="text-gray-300">
                    Selected: <span className="font-mono text-blue-400">{selectedContext || 'None'}</span>
                  </p>
                  {!configReadonly ? (
                    <button
                      onClick={() => applySelection('context')}
                      disabled={!selectedContext || configSaving}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium"
                    >
                      Apply Selection
                    </button>
                  ) : selectedContext && (
                    <button
                      onClick={() => {
                        const cName = contexts.find(c => c.context_id === selectedContext)?.name || '';
                        copyToClipboard(`LIVEAVATAR_CONTEXT_ID=${selectedContext}${cName ? ` #${cName}` : ''}`);
                      }}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-mono"
                    >
                      {copiedId === `LIVEAVATAR_CONTEXT_ID=${selectedContext}` ? 'Copied!' : 'Copy for .env.local'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {configMessage && activeTab !== 'config' && (
          <p className={`mt-4 text-sm ${configMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {configMessage}
          </p>
        )}
      </div>
    </div>
  );
}
