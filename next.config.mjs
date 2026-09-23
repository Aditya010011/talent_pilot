import { URL as NativeURL } from "node:url";

try {
  Object.defineProperty(global, "URL", {
    value: NativeURL,
    writable: false,
    configurable: false,
  });
} catch (e) {}

try {
  Object.defineProperty(globalThis, "URL", {
    value: NativeURL,
    writable: false,
    configurable: false,
  });
} catch (e) {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Avoid large webpack pack caches that can OOM the disk on small CI VMs.
  webpack: (config) => {
    config.cache = false;
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "ws",
      "bufferutil",
      "utf-8-validate",
      "@google-cloud/text-to-speech",
      "@google-cloud/speech",
      "@google-cloud/vertexai",
    ],
  },
  async rewrites() {
    return [
      {
        source: "/_supabase/:path*",
        destination: "http://127.0.0.1:54321/:path*",
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
