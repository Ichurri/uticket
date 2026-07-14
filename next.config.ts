import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  // Never reuse a dynamic page's client cache across navigations, so freshly
  // changed data always shows (paired with RefreshOnFocus for open tabs).
  experimental: {
    staleTimes: { dynamic: 0 },
  },
  // Baseline hardening; camera=(self) keeps the door scanner working.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  // Legacy Spanish routes (pre-rename) — keep old shared links working
  async redirects() {
    return [
      { source: "/eventos", destination: "/events", permanent: true },
      { source: "/eventos/:id", destination: "/events/:id", permanent: true },
      { source: "/pedidos", destination: "/orders", permanent: true },
      { source: "/pedidos/:id", destination: "/orders/:id", permanent: true },
      { source: "/carrito", destination: "/cart", permanent: true },
      {
        source: "/verificar-correo",
        destination: "/verify-email",
        permanent: true,
      },
      {
        source: "/ser-organizador",
        destination: "/become-organizer",
        permanent: true,
      },
      {
        source: "/dashboard/verificar",
        destination: "/dashboard/verify",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
