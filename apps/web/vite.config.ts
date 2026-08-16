import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 开发时数据来自 CLI 的本地查看服务:`pnpm dev:cli ui`
    proxy: {
      "/api": "http://127.0.0.1:4321",
    },
  },
});
