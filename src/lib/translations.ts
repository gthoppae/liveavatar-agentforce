export type Language = 'en' | 'nl';

export interface Translations {
  // Page
  pageTitle: string;
  voiceEnabledAvatar: string;
  voiceEnabledDescription: string;
  connect: string;
  connecting: string;
  disconnect: string;
  apiKeysNote: string;
  poweredBy: string;

  // Errors
  microphoneRequired: string;
  connectionFailed: string;

  // LiveAvatarSession
  initializing: string;
  startingSession: string;
  connected: string;
  ready: string;
  listening: string;
  speaking: string;
  processing: string;
  processingAgentforce: string;
  generatingSpeech: string;
  avatarSpeaking: string;
  errorProcessing: string;
  failedToStart: string;

  // Controls
  startVoiceChat: string;
  stopVoiceChat: string;
  mute: string;
  unmute: string;
  interrupt: string;

  // Conversation
  conversation: string;
  noMessagesYet: string;
  you: string;
  agent: string;

  // Status
  mode: string;
  session: string;
  quality: string;
  voice: string;
  muted: string;
  active: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    // Page
    pageTitle: 'LiveAvatar + Agentforce',
    voiceEnabledAvatar: 'Voice-Enabled AI Avatar',
    voiceEnabledDescription: 'Start a voice conversation with an AI avatar powered by Salesforce Agentforce. The avatar will listen to your speech and respond naturally.',
    connect: 'Connect',
    connecting: 'Connecting...',
    disconnect: 'Disconnect',
    apiKeysNote: 'Make sure you have configured your API keys in .env.local',
    poweredBy: 'Powered by HeyGen LiveAvatar and Salesforce Agentforce',

    // Errors
    microphoneRequired: 'Microphone access is required. Please allow microphone access and try again.',
    connectionFailed: 'Connection failed',

    // LiveAvatarSession
    initializing: 'Initializing...',
    startingSession: 'Starting session...',
    connected: 'Connected',
    ready: 'Ready',
    listening: 'Listening...',
    speaking: 'Speaking...',
    processing: 'Processing...',
    processingAgentforce: 'Processing with Agentforce...',
    generatingSpeech: 'Generating speech...',
    avatarSpeaking: 'Avatar speaking...',
    errorProcessing: 'Error processing message',
    failedToStart: 'Failed to start',

    // Controls
    startVoiceChat: 'Start Voice Chat',
    stopVoiceChat: 'Stop Voice Chat',
    mute: 'Mute',
    unmute: 'Unmute',
    interrupt: 'Interrupt',

    // Conversation
    conversation: 'Conversation',
    noMessagesYet: 'No messages yet. Start voice chat and speak!',
    you: 'You',
    agent: 'Agentforce',

    // Status
    mode: 'Mode',
    session: 'Session',
    quality: 'Quality',
    voice: 'Voice',
    muted: 'Muted',
    active: 'Active',
  },

  nl: {
    // Page
    pageTitle: 'LiveAvatar + Agentforce',
    voiceEnabledAvatar: 'Spraakgestuurde AI Avatar',
    voiceEnabledDescription: 'Start een spraakgesprek met een AI-avatar aangedreven door Salesforce Agentforce. De avatar luistert naar je stem en reageert op natuurlijke wijze.',
    connect: 'Verbinden',
    connecting: 'Verbinden...',
    disconnect: 'Verbinding verbreken',
    apiKeysNote: 'Zorg ervoor dat je API-sleutels hebt geconfigureerd in .env.local',
    poweredBy: 'Mogelijk gemaakt door HeyGen LiveAvatar en Salesforce Agentforce',

    // Errors
    microphoneRequired: 'Microfoontoegang is vereist. Sta microfoontoegang toe en probeer opnieuw.',
    connectionFailed: 'Verbinding mislukt',

    // LiveAvatarSession
    initializing: 'Initialiseren...',
    startingSession: 'Sessie starten...',
    connected: 'Verbonden',
    ready: 'Klaar',
    listening: 'Luisteren...',
    speaking: 'Spreken...',
    processing: 'Verwerken...',
    processingAgentforce: 'Verwerken met Agentforce...',
    generatingSpeech: 'Spraak genereren...',
    avatarSpeaking: 'Avatar spreekt...',
    errorProcessing: 'Fout bij verwerken van bericht',
    failedToStart: 'Starten mislukt',

    // Controls
    startVoiceChat: 'Start spraakgesprek',
    stopVoiceChat: 'Stop spraakgesprek',
    mute: 'Dempen',
    unmute: 'Dempen opheffen',
    interrupt: 'Onderbreken',

    // Conversation
    conversation: 'Gesprek',
    noMessagesYet: 'Nog geen berichten. Start een spraakgesprek en praat!',
    you: 'Jij',
    agent: 'Agentforce',

    // Status
    mode: 'Modus',
    session: 'Sessie',
    quality: 'Kwaliteit',
    voice: 'Stem',
    muted: 'Gedempt',
    active: 'Actief',
  },
};

export function getTranslations(lang: string | null): Translations {
  if (lang === 'nl') {
    return translations.nl;
  }
  return translations.en;
}
