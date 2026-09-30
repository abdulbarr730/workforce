import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // One in-memory MongoDB for the whole run (test/global-setup.ts); files
    // run one at a time because they share it and wipe it between tests.
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
