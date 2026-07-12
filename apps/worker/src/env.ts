// Load the repo-root .env (Railway injects real env vars in production, so a
// missing file is fine there).
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootEnv = resolve(fileURLToPath(import.meta.url), "../../../../.env");
if (existsSync(rootEnv)) config({ path: rootEnv });
