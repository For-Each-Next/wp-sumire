import js from "@eslint/js";
import { typescriptConfig } from "@for-each-next/wp/configs/eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const shared = typescriptConfig(tseslint);
export default defineConfig(
    globalIgnores(["dist/**", ".idea/**"]),
    {
        ...shared,
        extends: [js.configs.recommended, ...shared.extends],
        languageOptions: { globals: globals.nodeBuiltin },
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: { globals: globals.browser },
    },
    {
        files: [
            "src/draft-copy/wikitext.ts",
            "src/meta-contributions/{prefill-link,profile-wikitext,translation-note}.ts",
        ],
        // These input filters reject Unicode control characters explicitly.
        rules: { "no-control-regex": "off" },
    },
);
