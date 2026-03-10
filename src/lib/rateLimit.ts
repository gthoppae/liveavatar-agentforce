interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillPerSecond: number;
}

const buckets = new Map<string, TokenBucket>();

const LIMITS: Record<string, RateLimitConfig> = {
  '/api/admin/auth':       { maxTokens: 5,   refillPerSecond: 5 / 60 },
  '/api/demo/proxy':       { maxTokens: 30,  refillPerSecond: 30 / 60 },
  '/api/agent':            { maxTokens: 60,  refillPerSecond: 1 },
  '/api/tts':              { maxTokens: 60,  refillPerSecond: 1 },
  '/api/liveavatar/token': { maxTokens: 60,  refillPerSecond: 1 },
  default:                 { maxTokens: 120, refillPerSecond: 2 },
};

// Cleanup stale buckets every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [key, bucket] of buckets) {
      if (bucket.lastRefill < cutoff) buckets.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();
}

export function checkRateLimit(ip: string, path: string): { allowed: boolean; retryAfter?: number } {
  const configKey = Object.keys(LIMITS).find(k => k !== 'default' && path.startsWith(k)) || 'default';
  const config = LIMITS[configKey];
  const key = `${ip}:${configKey}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.maxTokens, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + elapsed * config.refillPerSecond);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true };
  }

  const retryAfter = Math.ceil((1 - bucket.tokens) / config.refillPerSecond);
  return { allowed: false, retryAfter };
}
