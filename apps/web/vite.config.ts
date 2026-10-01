import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],

  build: {
    rollupOptions: {
      input: {
        main: resolve(
          __dirname,
          "index.html",
        ),
        admin: resolve(
          __dirname,
          "admin.html",
        ),
      },
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
  },

  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
