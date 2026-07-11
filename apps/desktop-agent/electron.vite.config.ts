import { defineConfig } from "electron-vite";

import react from "@vitejs/plugin-react";

import tailwindcss from "@tailwindcss/vite";

import path from "node:path";

import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, "src-electron/main.ts"),

        external: [
          "active-win",
          "@mapbox/node-pre-gyp",
          "mock-aws-s3",
          "aws-sdk",
          "nock",
        ],
      },
    },
  },

  preload: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, "src-electron/preload.ts"),
      },
    },
  },

  renderer: {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src/renderer"),
      },
    },
  },
});
