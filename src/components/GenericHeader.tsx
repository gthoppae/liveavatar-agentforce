'use client';

import { sanitizeUrl, sanitizeColor } from '@/lib/sanitize';

interface GenericHeaderProps {
  logoUrl: string;
  logoAlt?: string;
  homeUrl?: string;
  primaryColor?: string;
}

export default function GenericHeader({
  logoUrl,
  logoAlt = 'Company Logo',
  homeUrl = '/',
  primaryColor = '#1a365d'
}: GenericHeaderProps) {
  const safeHomeUrl = sanitizeUrl(homeUrl, '/');
  const safeColor = sanitizeColor(primaryColor);

  return (
    <header className="w-full">
      {/* Logo Section */}
      <div className="bg-white py-4 shadow-sm">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <a href={safeHomeUrl} title="Homepage">
            <img
              src={logoUrl}
              alt={logoAlt}
              className="h-12 w-auto max-w-[200px] object-contain"
            />
          </a>

          {/* Powered by badge */}
          <div className="text-xs text-gray-400">
            Powered by AI Assistant
          </div>
        </div>
      </div>

      {/* Color bar */}
      <div
        className="h-1"
        style={{ backgroundColor: safeColor }}
      />
    </header>
  );
}
