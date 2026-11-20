import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      ".sandbox/**",
      "promo/out/**",
      "apps/desktop/release/**",
      "apps/desktop/out/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 项目铁律:禁止 any,用 unknown + 类型收窄
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "error",
    },
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:http",
                "node:https",
                "node:http2",
                "node:net",
                "node:dgram",
                "node:child_process",
                "node:cluster",
                "node:worker_threads",
                "hono",
                "hono/*",
                "@hono/*",
                "ai",
                "ai/*",
                "@ai-sdk/*",
                "react",
                "react-dom",
                "electron",
                "citty",
                "zod",
                "@skills-hub/*",
              ],
              message: "core 必须保持纯 TS + Node 文件 I/O,禁止引入框架、网络或子进程依赖（project-structure.md §二）",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@skills-hub/core", "@skills-hub/core/*"], message: "web 不直接 import core——数据走 HTTP /api（project-structure.md §二）" },
            { group: ["@skills-hub/cli", "@skills-hub/cli/*"], message: "web 不直接 import cli——数据走 HTTP /api（project-structure.md §二）" },
          ],
        },
      ],
    },
  },
  {
    // CLI 是终端程序,console 是它的正常输出通道
    files: ["packages/cli/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["apps/desktop/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@skills-hub/core", "@skills-hub/core/*"], message: "desktop src 不直接 import core——请通过 @skills-hub/cli 编程入口（project-structure.md §二）" },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/desktop/src/main.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["apps/desktop/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
    rules: { "no-console": "off" },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        WebSocket: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: { "no-console": "off" },
  },
  {
    // 宣传片舞台：浏览器里逐帧渲染的纯 JS（promo/README.md），不属于 workspace
    files: ["promo/src/**/*.js"],
    languageOptions: {
      globals: {
        Audio: "readonly",
        URLSearchParams: "readonly",
        document: "readonly",
        fetch: "readonly",
        location: "readonly",
        requestAnimationFrame: "readonly",
        window: "readonly",
      },
    },
  },
  {
    files: ["promo/*.mjs"],
    languageOptions: {
      globals: { Buffer: "readonly", URL: "readonly", console: "readonly", process: "readonly" },
    },
    rules: { "no-console": "off" },
  },
);
