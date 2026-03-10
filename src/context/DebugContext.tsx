'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface DebugEntry {
  timestamp: Date;
  type: 'transcribe' | 'agent-request' | 'agent-response' | 'tts' | 'error' | 'latency' | 'heygen' | 'liveavatar';
  data: unknown;
}

export interface LatencyMetrics {
  recordingDurationMs: number;
  recordingSizeBytes: number;
  sttLatencyMs: number;
  agentLatencyMs: number;
  ttsLatencyMs?: number;
  totalLatencyMs: number;
}

interface DebugContextType {
  debugLog: DebugEntry[];
  addDebugEntry: (type: DebugEntry['type'], data: unknown) => void;
  clearDebugLog: () => void;
}

const DebugContext = createContext<DebugContextType | undefined>(undefined);

export function DebugProvider({ children }: { children: ReactNode }) {
  const [debugLog, setDebugLog] = useState<DebugEntry[]>([]);

  const addDebugEntry = useCallback((type: DebugEntry['type'], data: unknown) => {
    setDebugLog((prev) => [
      { timestamp: new Date(), type, data },
      ...prev.slice(0, 99),
    ]);
  }, []);

  const clearDebugLog = useCallback(() => {
    setDebugLog([]);
  }, []);

  return (
    <DebugContext.Provider value={{ debugLog, addDebugEntry, clearDebugLog }}>
      {children}
    </DebugContext.Provider>
  );
}

export function useDebug() {
  const context = useContext(DebugContext);
  if (context === undefined) {
    throw new Error('useDebug must be used within a DebugProvider');
  }
  return context;
}
