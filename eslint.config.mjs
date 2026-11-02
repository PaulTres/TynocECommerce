import css from "@eslint/css"
import js from "@eslint/js"
import json from "@eslint/json"
import markdown from "@eslint/markdown"
import nextVitals from "eslint-config-next/core-web-vitals"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import { tailwind4 } from "tailwind-csstree"
import tseslint from "typescript-eslint"

// Shared glob for source files that run in the browser
const appSourceGlobs = [
    "app/**/*.{js,jsx,ts,tsx}",
    "components/**/*.{js,jsx,ts,tsx}",
];

export default defineConfig([
    ...nextVitals,
    {
        files: ["**/*.{js,mjs,cjs}"],
        plugins: { js },
        extends: ["js/recommended"],
    },
    {
        files: ["*.config.{js,mjs,cjs}", "eslint.config.{js,mjs,cjs}"],
        languageOptions: { globals: { ...globals.node } },
    },

    tseslint.configs.recommended,
    {
        //TypeScript already reports undefined identifiers at compile time
        files: ["**/*.{ts,tsx,mts,cts}"],
        rules: { "no-undef": "off" },
    },

    //JSON
    {
        files: ["**/*.json"],
        plugins: { json },
        language: "json/json",
        extends: ["json/recommended"],
        rules: { "json/no-empty-keys": "off" }, //this is done due to line 7 in package-lock
    },
    {
        files: ["**/*.jsonc"],
        plugins: { json },
        language: "json/jsonc",
        extends: ["json/recommended"],
    },
    {
        files: ["**/*.json5"],
        plugins: { json },
        language: "json/json5",
        extends: ["json/recommended"],
    },
    //markdown
    {
        files: ["**/*.md"],
        plugins: { markdown },
        language: "markdown/gfm",
        extends: ["markdown/recommended"],
        rules: { "markdown/fenced-code-language": "off" }, //off so we can put regular text in markdown code blocks nicely
    },
    //CSS
    {
        files: ["**/*.css"],
        plugins: { css },
        language: "css/css",
        extends: ["css/recommended"],
        languageOptions: { tolerant: true, customSyntax: tailwind4 }, //without tailwind4 it has no idea what to do with globals.css
        rules: {
            "css/no-important": "off",
            "css/no-invalid-properties": "off",
            "css/no-invalid-at-rules": "off",
        },
    },
    // Browser globals (window, document, fetch...) for app source files only.
    {
        files: appSourceGlobs,
        languageOptions: { globals: { ...globals.browser } },
    },
    //ignore generated files
    globalIgnores([".next/", "coverage/", "node_modules/", "next-env.d.ts"]),
]);
