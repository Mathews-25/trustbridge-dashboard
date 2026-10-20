import { spawnSync } from "node:child_process";

const buildDefaults = {
  DATABASE_URL:
    "postgresql://placeholder:placeholder@localhost:5432/trustbridge_dashboard?schema=public",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "build-time-placeholder-secret",
  TOKEN_ENCRYPTION_KEY: "build-time-placeholder-token-key",
  GITHUB_CLIENT_ID: "build-time-placeholder-client-id",
  GITHUB_CLIENT_SECRET: "build-time-placeholder-client-secret",
  GITHUB_MAINTAINER_ORG: "trustbridge",
};

const defaulted = [];
for (const [key, value] of Object.entries(buildDefaults)) {
  if (!process.env[key]?.trim()) {
    process.env[key] = value;
    defaulted.push(key);
  }
}

if (defaulted.length > 0) {
  console.warn(
    `Using build-time placeholder env values for: ${defaulted.join(", ")}.`
  );
}

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
