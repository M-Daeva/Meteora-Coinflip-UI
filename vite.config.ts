import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Anchor / web3.js expect Node globals (Buffer, process) in the browser
export default defineConfig({
  build: { chunkSizeWarningLimit: 2500 },
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({ include: ["buffer", "process", "util"], globals: { Buffer: true, process: true } }),
  ],
});
