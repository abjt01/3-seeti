import path from "node:path";
import type { NextConfig } from "next";

const root = path.dirname(new URL(import.meta.url).pathname);

const nextConfig: NextConfig = {
  outputFileTracingRoot: root,
  turbopack: { root },
};

export default nextConfig;
