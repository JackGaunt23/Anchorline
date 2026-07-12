import type { NextConfig } from "next";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Single .env at the repo root serves web, worker, and Prisma alike.
const rootEnv = resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) config({ path: rootEnv });

const nextConfig: NextConfig = {
  transpilePackages: ["@anchorline/db", "@anchorline/providers", "@anchorline/metrics"],
};

export default nextConfig;
