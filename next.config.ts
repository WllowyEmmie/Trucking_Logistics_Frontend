import type { NextConfig } from 'next';

// Requests go to /api/* on this origin and Next forwards them, including the /api/ws position socket
// upgrade, so the browser never needs the Go API's CORS list (CORS_ORIGINS on the API).
// BACKEND_URL is read by the server, not the browser.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8080';
// The dispatch agent, at /agent/* on this origin, so the session cookie reaches it too.
const AGENT_BACKEND_URL = process.env.AGENT_BACKEND_URL ?? 'http://localhost:8200';

// In mock mode there is no proxy at all: a request MSW doesn't intercept must fail (404), never
// fall through to a real backend and write to its database.
const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return MOCKING
      ? []
      : [
          { source: '/api/:path*', destination: `${BACKEND_URL}/:path*` },
          { source: '/agent/:path*', destination: `${AGENT_BACKEND_URL}/:path*` },
        ];
  },
};

export default nextConfig;
