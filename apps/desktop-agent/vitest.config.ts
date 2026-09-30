import { defineConfig } from "vitest/config";

// Unit tests for pure logic only (no Electron, no DOM). Keep Electron imports
// out of anything tested here; put pure helpers in src/shared or src/renderer/utils.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src-electron/**/*.test.ts"],
  },
});
