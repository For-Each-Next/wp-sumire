/**
 * @file src/wpvg-assessor/features/assessment/components/wikitext-comparison.ts
 * Purpose: MediaWiki-styled rendering for structured wikitext comparisons.
 *
 * Contents: Comparison component, source rows, and scoped build assets.
 */

import type { VueModule } from "../codex.ts";
import type {
    WikitextComparison,
    WikitextDiffLine,
} from "../../../domain/wikitext-comparison.ts";

export type CompactLine = WikitextDiffLine | { kind: "omitted"; segments: [] };

export interface WikitextComparisonProps {
    afterLabel: string;
    beforeLabel: string;
    compact?: boolean;
    comparison: WikitextComparison;
    label: string;
    noChangesLabel: string;
}

const WIKITEXT_COMPARISON_TEMPLATE =
    typeof __WPVG_ASSESSOR_WIKITEXT_COMPARISON_TEMPLATE__ === "undefined"
        ? ""
        : __WPVG_ASSESSOR_WIKITEXT_COMPARISON_TEMPLATE__;

export const WIKITEXT_COMPARISON_STYLES =
    typeof __WPVG_ASSESSOR_WIKITEXT_COMPARISON_STYLES__ === "undefined"
        ? ""
        : __WPVG_ASSESSOR_WIKITEXT_COMPARISON_STYLES__;

/**
 * Creates a reusable MediaWiki-style comparison component.
 *
 * @returns MediaWiki-style wikitext comparison component.
 */
export function createWikitextComparisonComponent(Vue: VueModule): unknown {
    return Vue.defineComponent({
        name: "WpvgAssessorWikitextComparison",
        props: {
            afterLabel: { required: true, type: String },
            beforeLabel: { required: true, type: String },
            compact: Boolean,
            comparison: { required: true, type: Object },
            label: { required: true, type: String },
            noChangesLabel: { required: true, type: String },
        },
        setup(props: WikitextComparisonProps) {
            const compactLines = Vue.computed(() =>
                props.comparison.rows.flatMap<CompactLine>((row) => {
                    if (row.kind === "omitted") {
                        return [{ kind: "omitted", segments: [] }];
                    }
                    const lines = [row.before];
                    if (row.after.kind === "added") lines.push(row.after);
                    return lines.filter((line) => line.kind !== "empty");
                }),
            );
            return { compactLines };
        },
        template: WIKITEXT_COMPARISON_TEMPLATE,
    });
}
