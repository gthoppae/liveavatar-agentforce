const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const HTTP_URL = /^https?:\/\//i;

export function sanitizeColor(color: string | null | undefined, fallback = '#1a365d'): string {
  if (!color) return fallback;
  return HEX_COLOR.test(color) ? color : fallback;
}

export function sanitizeUrl(url: string | null | undefined, fallback = '/'): string {
  if (!url) return fallback;
  return HTTP_URL.test(url) ? url : fallback;
}
