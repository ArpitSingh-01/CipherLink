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
  // Key: bundle application code + resolve @shared/* aliases,
  // but keep node_modules as externals (Vercel provides them at runtime)
  console.log("building Vercel API function...");
  await esbuild({
    entryPoints: ["server/vercel-entry.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "api/index.js",
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    alias: {
      "@shared": "./shared",
      "@": "./client/src",
    },
    // Externalize all node_modules — Vercel has them at runtime
    // This avoids trying to bundle native modules like lightningcss
    external: allDeps,
    minify: true,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
