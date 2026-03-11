'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ThemeSwitcher from '@/components/ThemeSwitcher';

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950 p-4">
      <div className="absolute top-4 right-4">
        <ThemeSwitcher />
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 md:p-8 max-w-2xl w-full">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Demo Mode</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Overlay the AI avatar widget on any customer website for presales demos.
        </p>

        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-300">
            <strong>Proxy Mode:</strong> We fetch the customer site server-side and inject the widget. URL bar shows our domain, but you can enable a banner to display the original URL.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Website URL</label>
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
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-800"
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
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Brand color (optional)</label>
                  <input
                    name="color"
                    type="text"
                    placeholder="#0077b6"
                    className="w-32 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-800"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer pb-1">
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
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Quick links:</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Wikipedia', url: 'https://www.wikipedia.org', color: '#333333' },
                { label: 'Tesla', url: 'https://www.tesla.com', color: '#cc0000' },
              ].map(site => (
                <a
                  key={site.label}
                  href={buildProxyUrl(site.url, site.color, null, showUrlBanner)}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {site.label}
                </a>
              ))}
            </div>
          </div>
        </div>
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
