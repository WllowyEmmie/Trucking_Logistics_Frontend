import type { NextConfig } from 'next';

// Requests go to /api/* on this origin and Next forwards them, including the /api/ws position socket
// upgrade. The Go API's CORS list is localhost-only and has no PATCH, so nothing relies on it.
// BACKEND_URL is read by the server, not the browser.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8080';

// In mock mode there is no proxy at all: a request MSW doesn't intercept must fail (404), never
// fall through to a real backend and write to its database.
const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return MOCKING ? [] : [{ source: '/api/:path*', destination: `${BACKEND_URL}/:path*` }];
  },
};

export default nextConfig;
