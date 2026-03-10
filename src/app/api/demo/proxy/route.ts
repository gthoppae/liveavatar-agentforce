import { NextRequest, NextResponse } from 'next/server';
import { validateUrl } from '@/lib/validateUrl';
import { sanitizeColor } from '@/lib/sanitize';
import { apiGuard } from '@/lib/apiGuard';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

// Fetch with manual redirect following + cookie jar (needed for sites
// that use SSO login-check redirects that set cookies)
async function fetchWithCookies(url: string, maxRedirects = 10): Promise<Response> {
  const cookies: Record<string, string> = {};
  let currentUrl = url;

  for (let i = 0; i < maxRedirects; i++) {
    const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(currentUrl, {
      headers: {
        ...BROWSER_HEADERS,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      redirect: 'manual',
    });

    // Collect Set-Cookie headers
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const match = sc.match(/^([^=]+)=([^;]*)/);
      if (match) cookies[match[1]] = match[2];
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      currentUrl = new URL(location, currentUrl).href;
      // SSRF: validate redirect target
      const redirectCheck = await validateUrl(currentUrl);
      if (!redirectCheck.valid) throw new Error(`Redirect blocked: ${redirectCheck.reason}`);
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects');
}

export async function GET(request: NextRequest) {
  const guardResponse = apiGuard(request);
  if (guardResponse) return guardResponse;

  const url = request.nextUrl.searchParams.get('url');
  const color = sanitizeColor(request.nextUrl.searchParams.get('color'), '#0077b6');
  const lang = request.nextUrl.searchParams.get('lang') || '';
  const showUrl = request.nextUrl.searchParams.get('showUrl') !== 'false'; // default true

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const validation = await validateUrl(url);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 403 });
  }

  const baseOrigin = parsedUrl.origin;
  // Our server's public origin — needed because <base> tag redirects all relative URLs to the customer site
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const ourOrigin = `${proto}://${host}`;

  try {
    const response = await fetchWithCookies(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch ${url}: ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      // For non-HTML resources, pass through as-is
      const body = await response.arrayBuffer();
      return new NextResponse(body, {
        headers: { 'Content-Type': contentType },
      });
    }

    let html = await response.text();

    // Strip CSP meta tags — the customer's CSP would block our injected content
    html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');

    // Rewrite same-origin iframe src to go through our proxy (avoids frame-ancestors CSP blocks)
    const proxyBase = `${ourOrigin}/api/demo/proxy?color=${encodeURIComponent(color)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}&url=`;
    // Absolute URLs matching the customer origin
    html = html.replace(
      new RegExp(`(<iframe[^>]*\\ssrc\\s*=\\s*["'])${baseOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/[^"']*)?(["'])`, 'gi'),
      (_, before, path, after) => `${before}${proxyBase}${encodeURIComponent(baseOrigin + (path || '/'))}${after}`
    );
    // Relative iframe src (starts with /) — these resolve to customer origin via <base>
    html = html.replace(
      /(<iframe[^>]*\ssrc\s*=\s*["'])(\/[^"']*)(["'])/gi,
      (_, before, path, after) => `${before}${proxyBase}${encodeURIComponent(baseOrigin + path)}${after}`
    );

    // Inject <base> tag and iframe-proxy script right after <head>
    const baseTag = `<base href="${baseOrigin}/">`;
    // Script to intercept ALL iframe src assignments before the browser fetches them.
    // Overrides the property setter so even `iframe.src = "..."` is caught synchronously.
    const iframeProxyScript = `<script>
(function(){
  var origin = ${JSON.stringify(baseOrigin)};
  var proxyBase = ${JSON.stringify(proxyBase)};
  function rewriteSrc(src) {
    if (!src) return src;
    try {
      var u = new URL(src, origin);
      if (u.origin === origin) return proxyBase + encodeURIComponent(u.href);
    } catch(e) {}
    return src;
  }
  // Override iframe.src setter
  var desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
  if (desc && desc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      set: function(v) { desc.set.call(this, rewriteSrc(v)); },
      get: desc.get,
      configurable: true
    });
  }
  // Override setAttribute for iframes
  var origSetAttr = HTMLIFrameElement.prototype.setAttribute;
  HTMLIFrameElement.prototype.setAttribute = function(name, value) {
    if (name.toLowerCase() === 'src') value = rewriteSrc(value);
    return origSetAttr.call(this, name, value);
  };
})();
</script>`;
    const headMatch = html.match(/<head[^>]*>/i);
    if (headMatch) {
      html = html.replace(headMatch[0], `${headMatch[0]}\n${baseTag}\n${iframeProxyScript}`);
    } else {
      html = `${baseTag}\n${iframeProxyScript}\n${html}`;
    }

    // Build embed URL for the iframe
    const embedParams = new URLSearchParams();
    embedParams.set('color', color);
    if (lang) embedParams.set('lang', lang);
    const embedUrl = `${ourOrigin}/embed?${embedParams.toString()}`;

    // Widget: floating button + embedded iframe panel + optional URL banner
    const bannerStyles = showUrl ? `
  #demo-url-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: white;
    padding: 8px 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    z-index: 99997;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  #demo-url-banner a {
    color: #60a5fa;
    text-decoration: none;
    font-weight: 500;
  }
  #demo-url-banner a:hover {
    text-decoration: underline;
  }
  #demo-url-banner .demo-label {
    background: ${color};
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
  #demo-url-banner button {
    background: transparent;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px;
    margin-left: 8px;
    display: flex;
    align-items: center;
  }
  #demo-url-banner button:hover {
    color: white;
  }
  body.has-demo-banner {
    margin-top: 40px !important;
  }` : '';

    const widgetScript = `
<!-- AI Avatar Demo Widget -->
<style>${bannerStyles}
  #demo-widget-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background-color: ${color};
    color: white;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  #demo-widget-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  }
  #demo-widget-btn svg {
    width: 28px;
    height: 28px;
  }
  #demo-widget-panel {
    position: fixed;
    bottom: 96px;
    right: 24px;
    width: 400px;
    height: 560px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    z-index: 99998;
    display: none;
    border: 2px solid ${color};
    background: white;
  }
  #demo-widget-panel.open {
    display: block;
  }
  #demo-widget-panel iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
</style>
${showUrl ? `<div id="demo-url-banner">
  <span class="demo-label">Simulation</span>
  <span>Showing: <a href="${url}" target="_blank">${url}</a></span>
  <button onclick="document.getElementById('demo-url-banner').style.display='none'; document.body.classList.remove('has-demo-banner');" title="Hide banner">
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
  </button>
</div>` : ''}
<div id="demo-widget-panel">
  <iframe src="${embedUrl}" allow="microphone; camera" title="AI Assistant"></iframe>
</div>
<button id="demo-widget-btn" title="Talk to AI Assistant" onclick="toggleAvatarWidget()">
  <svg id="demo-widget-icon-open" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
  </svg>
  <svg id="demo-widget-icon-close" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="display:none">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
  </svg>
</button>
<script>
  ${showUrl ? "// Add class to body to shift content down for banner\n  document.body.classList.add('has-demo-banner');" : ''}

  function toggleAvatarWidget() {
    var panel = document.getElementById('demo-widget-panel');
    var iconOpen = document.getElementById('demo-widget-icon-open');
    var iconClose = document.getElementById('demo-widget-icon-close');
    var isOpen = panel.classList.toggle('open');
    iconOpen.style.display = isOpen ? 'none' : 'block';
    iconClose.style.display = isOpen ? 'block' : 'none';
    // Tell the embed iframe to restore if we're opening the panel
    if (isOpen) {
      var iframe = panel.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'avatar-widget-restore' }, '*');
      }
    }
  }

  // Listen for minimize/restore messages from the embed iframe
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'avatar-widget-minimize') {
      var panel = document.getElementById('demo-widget-panel');
      var iconOpen = document.getElementById('demo-widget-icon-open');
      var iconClose = document.getElementById('demo-widget-icon-close');
      if (panel) panel.classList.remove('open');
      if (iconOpen) iconOpen.style.display = 'block';
      if (iconClose) iconClose.style.display = 'none';
    }
    if (event.data && event.data.type === 'avatar-widget-restore') {
      var panel = document.getElementById('demo-widget-panel');
      var iconOpen = document.getElementById('demo-widget-icon-open');
      var iconClose = document.getElementById('demo-widget-icon-close');
      if (panel) panel.classList.add('open');
      if (iconOpen) iconOpen.style.display = 'none';
      if (iconClose) iconClose.style.display = 'block';
    }
  });
</script>
<!-- End AI Avatar Demo Widget -->`;

    // Inject before </body> or at the end
    if (html.match(/<\/body>/i)) {
      html = html.replace(/<\/body>/i, `${widgetScript}\n</body>`);
    } else {
      html += widgetScript;
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "frame-src *; child-src *; default-src * 'unsafe-inline' data: blob:",
        'X-Frame-Options': '',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to proxy ${url}: ${message}` },
      { status: 502 }
    );
  }
}
