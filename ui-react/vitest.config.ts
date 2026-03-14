import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^@\//,
                replacement: `${path.resolve(__dirname, "./src")}/`,
            },
            {
                find: /^monaco-editor$/,
                replacement: path.resolve(
                    __dirname,
                    "./src/test/mocks/monaco-editor.ts",
                ),
            },
            {
                find: /^monaco-yaml$/,
                replacement: path.resolve(
                    __dirname,
                    "./src/test/mocks/monaco-yaml.ts",
                ),
            },
            {
                find: /^monaco-editor\/esm\/vs\/editor\/editor\.worker\?worker$/,
                replacement: path.resolve(
                    __dirname,
                    "./src/test/mocks/editor-worker.ts",
                ),
            },
        ],
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: "./src/test/setup.ts",
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
