import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "website", "public", "playground");
const expected = path.join(root, "website", "public") + path.sep;
if (!destination.startsWith(expected))
  throw new Error("Unsafe playground destination");
await readFile(path.join(root, "dist", "index.html"));
await mkdir(destination, { recursive: true });
// Only our generated playground artifacts are replaced; no user data lives here.
for (const entry of await readdir(destination)) {
  if (entry === "assets" || entry === "index.html")
    await rm(path.join(destination, entry), { recursive: true, force: true });
}
await cp(path.join(root, "dist"), destination, { recursive: true });
console.log("Current browser workspace copied to website/public/playground.");

// Keep the offline desktop guide and website instructions identical.
await mkdir(path.join(root, "website/components/help"), { recursive: true });
await cp(path.join(root, "src/components/help/ConnectionGuide.tsx"), path.join(root, "website/components/help/ConnectionGuide.tsx"));
await cp(path.join(root, "src/styles/connection-guide.css"), path.join(root, "website/components/help/connection-guide.css"));

await mkdir(path.join(root, "website/components/canvas"), { recursive: true });
for (const name of ["AstralWaveCanvas.tsx", "floatingLinesShader.ts", "motion.ts"]) {
  await cp(path.join(root, "src/components/canvas", name), path.join(root, "website/components/canvas", name));
}

await cp(path.join(root, "src/components/help/AnimatedDisclosure.tsx"), path.join(root, "website/components/help/AnimatedDisclosure.tsx"));
