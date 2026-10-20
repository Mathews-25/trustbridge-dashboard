import { spawnSync } from "node:child_process";

const fallbackDatabaseUrl =
  "postgresql://placeholder:placeholder@localhost:5432/trustbridge_dashboard?schema=public";

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = fallbackDatabaseUrl;
  console.warn(
    "DATABASE_URL is unset or empty; using a placeholder URL for prisma generate."
  );
}

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
