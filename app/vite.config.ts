import { readFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

function localCoachSnapshot(): Plugin {
  return {
    name: "local-coach-snapshot",
    apply: "serve",
    configureServer(server) {
      const snapshotPath = process.env.POSETEK_COACH_SNAPSHOT_PATH;
      if (!snapshotPath || server.config.server.host !== "127.0.0.1") return;

      server.middlewares.use("/__coach-view/local-snapshot", async (request, response) => {
        const host = `127.0.0.1:${server.config.server.port}`;
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "GET" || request.headers.host !== host ||
            request.headers["sec-fetch-site"] !== "same-origin") {
          response.writeHead(404).end();
          return;
        }
        try {
          const snapshot = await readFile(snapshotPath, "utf8");
          response.writeHead(200, { "Content-Type": "application/json" }).end(snapshot);
        } catch {
          response.writeHead(503).end();
        }
      });
    },
  };
}

// Build straight into the repo-root dist/ — Netlify and Firebase Hosting both
// publish that directory. scripts/copy-legacy.mjs then adds the unported
// legacy pages alongside the SPA bundle.
export default defineConfig({
  envPrefix: ["VITE_", "PUBLIC_FIREBASE_EMULATOR_PORT_OFFSET"],
  plugins: [react(), svelte({ configFile: false }), tailwindcss(), localCoachSnapshot()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
