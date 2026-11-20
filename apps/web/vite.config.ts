import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dir, "src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "charts",
              test: /[\\/]node_modules[\\/](recharts|d3-|victory-vendor)[\\/]/,
              priority: 25,
            },
            {
              name: "ai-sdk",
              test: /[\\/]node_modules[\\/](ai|@ai-sdk|zod)[\\/]/,
              priority: 20,
            },
            {
              name: "markdown",
              test: /[\\/]node_modules[\\/](highlight\.js|marked|dompurify)[\\/]/,
              priority: 20,
            },
            {
              name: "ui-vendor",
              test: /[\\/]node_modules[\\/](@base-ui|lucide-react|sonner|react-resizable-panels|class-variance-authority|clsx|tailwind-merge)[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  server: {
    // 开发时数据来自 CLI 的本地查看服务:`pnpm dev:cli ui`
    proxy: {
      "/api": "http://127.0.0.1:4321",
    },
  },
});
