import { readFile } from "node:fs/promises";

import { parse } from "@vue/compiler-sfc";

const features = new URL("../../src/wpvg-assessor/features/", import.meta.url);
const components = {
    ARCHIVE_DIALOG: "archive/dialogs/archive-dialog",
    DIALOG: "assessment/dialogs/assessment-dialog",
    LOADING_DIALOG: "assessment/dialogs/loading-dialog",
    WIKITEXT_COMPARISON: "assessment/components/wikitext-comparison",
    CATEGORY_DIALOG: "assessment/dialogs/category-dialog",
};

export async function readAssessorAssets() {
    const assets = await Promise.all(
        Object.entries(components).map(async ([name, path]) => {
            const filename = `${path}.vue`;
            const [source, styles] = await Promise.all([
                readFile(new URL(filename, features), "utf8"),
                readFile(new URL(`${path}.css`, features), "utf8"),
            ]);
            const { descriptor, errors } = parse(source, { filename });
            if (
                errors.length ||
                !descriptor.template?.ast ||
                descriptor.script ||
                descriptor.scriptSetup ||
                descriptor.styles.length ||
                descriptor.customBlocks.length
            ) {
                throw new Error(
                    `${filename} must contain one Vue template only.`,
                );
            }
            return [
                [
                    `__WPVG_ASSESSOR_${name}_TEMPLATE__`,
                    descriptor.template.content.trim(),
                ],
                [`__WPVG_ASSESSOR_${name}_STYLES__`, styles.trim()],
            ];
        }),
    );
    return Object.fromEntries(
        [
            ...assets.flat(),
            [
                "__WPVG_ASSESSOR_ARTICLE_PREVIEW_STYLES__",
                (
                    await readFile(
                        new URL(
                            "assessment/dialogs/article-preview.css",
                            features,
                        ),
                        "utf8",
                    )
                ).trim(),
            ],
        ].map(([name, source]) => [name, JSON.stringify(source)]),
    );
}
