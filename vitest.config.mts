// Vitest configuration.
//
// This project's simulation engine (lib/v2g-simulation.ts) is deliberately plain
// TypeScript with no React/browser code in it, so its tests don't need a simulated
// browser (a "DOM environment") to run — using environment: "node" keeps the test
// suite fast and makes it obvious the engine truly has no hidden UI dependency.
// If UI component tests are added later, they'd need their own config with
// environment: "jsdom" instead.
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirrors the "@/*" import alias configured in tsconfig.json, so test files
      // can use the same "@/lib/..." style imports as the rest of the app.
      "@": path.resolve(__dirname, "."),
    },
  },
});
