import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "helmet",
  "nanoid",
  "postgres",
  "ws",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server (dev entry)...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    alias: {
      "@shared": "./shared",
      "@": "./client/src",
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Build the Vercel serverless API function
  // Bundle application code + ESM-only deps + common deps
  // Only externalize deps that are CJS-compatible and available in node_modules at runtime
  console.log("building Vercel API function...");

  // Deps that MUST be bundled (ESM-only or needed inline)
  const vercelBundled = [
    ...allowlist,
    "@noble/curves",
    "@scure/bip39",
    "@scure/base",
    "@noble/hashes",
  ];
  const vercelExternals = allDeps.filter((dep) => !vercelBundled.includes(dep));

  await esbuild({
    entryPoints: ["server/vercel-entry.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "api/index.js",
    alias: {
      "@shared": "./shared",
      "@": "./client/src",
    },
    external: vercelExternals,
    minify: true,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
