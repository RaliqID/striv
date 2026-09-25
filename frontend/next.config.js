/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_PROXY_URL || "http://127.0.0.1:8001";

const nextConfig = {
  /**
   * Proxy API calls through the Next server.
   *
   * The browser normally talks to the Laravel API directly on port 8001, which
   * only works on this machine. Routing /api/* through Next means a single
   * public tunnel exposes the whole app — the browser makes same-origin
   * requests, so there is no CORS surface and no second tunnel to manage.
   *
   * Requests to /api/* are rewritten to the backend's own /api/* path, which
   * already includes the version prefix (e.g. /api/v1/auth/login).
   */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};
module.exports = nextConfig;
