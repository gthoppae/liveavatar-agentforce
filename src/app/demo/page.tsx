'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function buildProxyUrl(siteUrl: string, color?: string | null, lang?: string | null, showUrl?: boolean) {
  const params = new URLSearchParams();
  params.set('url', siteUrl);
  if (color) params.set('color', color);
  if (lang) params.set('lang', lang);
  if (showUrl === false) params.set('showUrl', 'false');
  return `/api/demo/proxy?${params.toString()}`;
}

function DemoContent() {
  const searchParams = useSearchParams();
  const siteUrl = searchParams.get('site');
  const color = searchParams.get('color');
  const lang = searchParams.get('lang');
  const [activeTab, setActiveTab] = useState<'proxy' | 'extension'>('proxy');
  const [extensionColor, setExtensionColor] = useState('#0077b6');
  const [showUrlBanner, setShowUrlBanner] = useState(true);

  // If ?site= is provided, redirect to the proxy route
  useEffect(() => {
    if (siteUrl) {
      window.location.replace(buildProxyUrl(siteUrl, color, lang));
    }
  }, [siteUrl, color, lang]);

  // Show loading state while redirecting
  if (siteUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500">Loading customer site...</div>
      </div>
    );
  }

  // Generate Tampermonkey script - uses popup to avoid cross-origin microphone issues
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  const embedUrl = `${appOrigin}/embed?color=${encodeURIComponent(extensionColor)}`;

  const tampermonkeyScript = `// ==UserScript==
// @name         AI Avatar Demo Widget
// @namespace    ${appOrigin}
// @version      1.4
// @description  Overlay AI Avatar chat widget on any website
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';
    var EMBED_URL = '${embedUrl}';
    var BRAND_COLOR = '${extensionColor}';

    if (window.location.hostname.includes('liveavatar-agentforce-app')) return;

    var style = document.createElement('style');
    style.textContent = [
        '#ai-avatar-widget-btn {',
        '  position: fixed; bottom: 24px; right: 24px;',
        '  width: 60px; height: 60px; border-radius: 50%;',
        '  background-color: ' + BRAND_COLOR + ';',
        '  color: white; border: none; cursor: pointer;',
        '  box-shadow: 0 4px 16px rgba(0,0,0,0.3);',
        '  z-index: 2147483647;',
        '  display: flex; align-items: center; justify-content: center;',
        '  transition: transform 0.2s, box-shadow 0.2s;',
        '}',
        '#ai-avatar-widget-btn:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(0,0,0,0.4); }',
        '#ai-avatar-widget-btn svg { width: 28px; height: 28px; }'
    ].join('\\n');
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.id = 'ai-avatar-widget-btn';
    btn.title = 'Talk to AI Assistant';
    btn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>';
    document.body.appendChild(btn);

    var popupWindow = null;
    btn.addEventListener('click', function() {
        if (popupWindow && !popupWindow.closed) { popupWindow.focus(); return; }
        var w = 420, h = 600;
        var left = window.screenX + window.outerWidth - w - 50;
        var top = window.screenY + 100;
        popupWindow = window.open(EMBED_URL, 'AIAvatarAssistant',
            'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no');
        if (popupWindow) popupWindow.focus();
    });

    console.log('[AI Avatar Widget] Loaded (popup mode)');
})();`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 max-w-2xl w-full">
        <h1 className="text-2xl font-bold mb-2 text-gray-900">Demo Mode</h1>
        <p className="text-gray-600 mb-6">
          Overlay the AI avatar widget on any customer website for presales demos.
        </p>

        {/* Tab selector */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('proxy')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'proxy'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Proxy Mode
          </button>
          <button
            onClick={() => setActiveTab('extension')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'extension'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Browser Extension
          </button>
        </div>

        {activeTab === 'proxy' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <strong>Proxy Mode:</strong> We fetch the customer site server-side and inject the widget. URL bar shows our domain, but you can enable a banner to display the original URL.
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Website URL</label>
              <form onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const input = form.elements.namedItem('url') as HTMLInputElement;
                const colorInput = form.elements.namedItem('color') as HTMLInputElement;
                const url = input.value.trim();
                if (url) {
                  const fullUrl = url.startsWith('http') ? url : `https://${url}`;
                  window.location.href = buildProxyUrl(fullUrl, colorInput.value || null, null, showUrlBanner);
                }
              }}>
                <div className="flex gap-2">
                  <input
                    name="url"
                    type="text"
                    placeholder="https://www.example.com"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Load
                  </button>
                </div>
                <div className="mt-2 flex gap-4 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Brand color (optional)</label>
                    <input
                      name="color"
                      type="text"
                      placeholder="#0077b6"
                      className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-1">
                    <input
                      type="checkbox"
                      checked={showUrlBanner}
                      onChange={(e) => setShowUrlBanner(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Show simulation banner
                  </label>
                </div>
              </form>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-2">Quick links:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Wikipedia', url: 'https://www.wikipedia.org', color: '#333333' },
                  { label: 'Tesla', url: 'https://www.tesla.com', color: '#cc0000' },
                ].map(site => (
                  <a
                    key={site.label}
                    href={buildProxyUrl(site.url, site.color, null, showUrlBanner)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                  >
                    {site.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'extension' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <strong>Extension Mode:</strong> Install a browser script that adds the widget to any site. URL shows the real customer domain. Opens a popup for microphone access.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Widget color</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={extensionColor}
                    onChange={(e) => setExtensionColor(e.target.value)}
                    className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={extensionColor}
                    onChange={(e) => setExtensionColor(e.target.value)}
                    className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Installation Steps</label>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                  <li>Install <a href="https://www.tampermonkey.net/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Tampermonkey</a> browser extension</li>
                  <li>Click the Tampermonkey icon → "Create new script"</li>
                  <li>Delete the template code and paste the script below</li>
                  <li>Save (Ctrl/Cmd + S)</li>
                  <li>Visit any website - the widget button appears!</li>
                </ol>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700">Tampermonkey Script</label>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tampermonkeyScript);
                      alert('Script copied to clipboard!');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Copy to clipboard
                  </button>
                </div>
                <textarea
                  readOnly
                  value={tampermonkeyScript}
                  className="w-full h-48 px-3 py-2 text-xs font-mono bg-gray-900 text-green-400 rounded-lg border border-gray-700 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DemoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <DemoContent />
    </Suspense>
  );
}
