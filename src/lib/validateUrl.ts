import dns from 'dns/promises';

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.internal',
]);

export async function validateUrl(urlString: string): Promise<{ valid: true; url: URL } | { valid: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, reason: 'Invalid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, reason: 'Only http and https protocols allowed' };
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: 'Blocked hostname' };
  }

  // Check if hostname is already an IP literal
  if (isBlockedIPv4(hostname)) {
    return { valid: false, reason: 'URL resolves to a blocked IP range' };
  }
  if (hostname === 'localhost') {
    return { valid: false, reason: 'URL resolves to a blocked IP range' };
  }
  // IPv6 literal in URL: [::1]
  const ipv6Match = hostname.match(/^\[(.+)\]$/);
  if (ipv6Match && isBlockedIPv6(ipv6Match[1])) {
    return { valid: false, reason: 'URL resolves to a blocked IP range' };
  }

  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);

    for (const ip of addresses) {
      if (isBlockedIPv4(ip)) {
        return { valid: false, reason: 'URL resolves to a blocked IP range' };
      }
    }
    for (const ip of addresses6) {
      if (isBlockedIPv6(ip)) {
        return { valid: false, reason: 'URL resolves to a blocked IP range' };
      }
    }
  } catch {
    // DNS resolution failed — allow fetch to proceed (may resolve at fetch time)
  }

  return { valid: true, url };
}

function isBlockedIPv4(ip: string): boolean {
  if (ip.startsWith('127.')) return true;      // loopback
  if (ip.startsWith('10.')) return true;       // RFC 1918
  if (ip.startsWith('192.168.')) return true;  // RFC 1918
  if (ip.startsWith('169.254.')) return true;  // link-local / cloud metadata
  if (ip.startsWith('0.')) return true;        // current network
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true; // 172.16.0.0/12
  }
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('fe80')) return true; // link-local
  return false;
}
