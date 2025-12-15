import { execSync } from "child_process";
import { mkdirSync, rmSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");

// Limpar dist
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

console.log("🔨 Building with tsx...");

// Usar tsx para transpilar (usa esbuild internamente - muito rápido)
try {
  execSync(
    "npx esbuild src/**/*.ts --outdir=dist --format=esm --platform=node --target=node20 --packages=external",
    {
      cwd: rootDir,
      stdio: "inherit",
      shell: true,
    }
  );
  console.log("✅ Build completed successfully!");
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
