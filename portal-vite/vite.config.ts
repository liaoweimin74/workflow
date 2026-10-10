import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";

/**
 * D+ 方案：门户 vite 化（Task D+，2026-10-06）
 *
 * 门户从 Next.js dev（~1.26G 常驻）迁移到 vite dev（~300MB）：
 * - 页面零拷贝：alias "@" 指回主项目 src，直接复用 src/app/page.tsx 与 shadcn 组件
 * - /api/*        → portal-bff（bun，127.0.0.1:3010），承接原 Next route handlers
 * - /lowcode/*    → lowcode vite 源站（127.0.0.1:5173），替换 Next 手动反代 +
 *                   middleware query 还原 hack（http-proxy 不做 query 规范化，hack 不再需要）
 * - ws: true 顺带打通 lowcode HMR websocket（Next 时代无法代理）
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3010",
        changeOrigin: false,
        ws: false,
      },
      "/lowcode": {
        target: "http://127.0.0.1:5173",
        changeOrigin: false,
        ws: true,
      },
    },
  },
});
