import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.qrserver.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOW-FROM https://console.palette-lab.com' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://console.palette-lab.com" },
        ],
      },
    ];
  },
};

export default nextConfig;
