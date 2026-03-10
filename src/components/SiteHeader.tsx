'use client';

import GenericHeader from './GenericHeader';

interface SiteHeaderProps {
  site: string | null;
  logoUrl?: string | null;
  logoAlt?: string | null;
  homeUrl?: string | null;
  primaryColor?: string | null;
}

export default function SiteHeader({ site, logoUrl, logoAlt, homeUrl, primaryColor }: SiteHeaderProps) {
  // If logoUrl is provided, use generic header regardless of site
  if (logoUrl) {
    return (
      <GenericHeader
        logoUrl={logoUrl}
        logoAlt={logoAlt || undefined}
        homeUrl={homeUrl || undefined}
        primaryColor={primaryColor || undefined}
      />
    );
  }

  if (!site) {
    return null;
  }

  // Add custom site headers here:
  // case 'mycustomer':
  //   return <MyCustomerHeader />;
  // For now, all sites use the generic header or return null
  switch (site.toLowerCase()) {
    default:
      return null;
  }
}
