/**
 * Simple in-memory session store for LiveAvatar tokens
 * Bounded with TTL and max size to prevent memory exhaustion
 */

interface StoredSession {
  sessionToken: string;
  sessionId: string;
  createdAt: Date;
}

const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

const sessions = new Map<string, StoredSession>();

// Periodic cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
        sessions.delete(id);
      }
    }
  }, 10 * 60 * 1000).unref?.();
}

export function storeSession(sessionId: string, sessionToken: string): void {
  // Evict oldest if at capacity
  if (sessions.size >= MAX_SESSIONS) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, s] of sessions) {
      if (s.createdAt.getTime() < oldestTime) {
        oldestTime = s.createdAt.getTime();
        oldestKey = key;
      }
    }
    if (oldestKey) sessions.delete(oldestKey);
  }

  sessions.set(sessionId, { sessionToken, sessionId, createdAt: new Date() });
}

export function getSession(sessionId: string): StoredSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;

  if (Date.now() - session.createdAt.getTime() > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return undefined;
  }
  return session;
}

export function removeSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function getAllSessions(): StoredSession[] {
  const now = Date.now();
  const valid: StoredSession[] = [];
  for (const [id, session] of sessions) {
    if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    } else {
      valid.push(session);
    }
  }
  return valid;
}

export function clearAllSessions(): void {
  sessions.clear();
}
