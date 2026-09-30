import { defineConfig } from "vitest/config";

// Unit tests for pure helpers (src/lib). Component tests would need jsdom and
// @testing-library/react; add them here when the first one is written.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
