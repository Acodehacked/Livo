import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// The monorepo keeps one .env at the repository root, but Next.js only reads env files from apps/web
// (and @next/env caches that first load). Fill in anything missing from the root files; real
// environment variables and apps/web/.env* still win.
for (const file of [".env.local", ".env"]) {
  const envPath = path.resolve(process.cwd(), "../..", file);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@livo/types"],
};

export default nextConfig;
