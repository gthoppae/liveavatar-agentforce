/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Disable React strict mode to prevent double-initialization
  // of LiveAvatar sessions (WebRTC connections shouldn't be opened twice)
  reactStrictMode: false,

  async headers() {
    return [
      {
        // Allow the /embed route to be loaded in iframes on any site
        source: '/embed',
        headers: [
          { key: 'X-Frame-Options', value: '' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ];
  },
};

export default nextConfig;
