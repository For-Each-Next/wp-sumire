/**
 * @file src/wpvg-assessor/features/assessment/codex.ts
 * Purpose: Define Article Assessor's host Vue and Codex requirements.
 * Contents: Vue/Codex host contracts and component registration.
 */

import { registerCodexComponents } from "../../support/mediawiki-runtime/codex.ts";
import type {
    VueApp,
    VueCore,
    VueRef,
} from "../../support/mediawiki-runtime/contracts.ts";
export type {
    VueApp,
    VueRef,
} from "../../support/mediawiki-runtime/contracts.ts";

export interface VueModule extends VueCore {
    shallowRef<T>(value: T): VueRef<T>;
    nextTick(callback: () => void): Promise<void>;
    computed<T>(getter: () => T): VueRef<T>;
    onMounted(callback: () => void): void;
    onUnmounted(callback: () => void): void;
    reactive<T extends object>(value: T): T;
}

const COMPONENT_NAMES = [
    "CdxAccordion",
    "CdxIcon",
    "CdxButton",
    "CdxButtonGroup",
    "CdxCheckbox",
    "CdxDialog",
    "CdxField",
    "CdxMessage",
    "CdxProgressBar",
    "CdxRadio",
    "CdxTextArea",
    "CdxTextInput",
] as const;

export type CodexComponents = Record<
    (typeof COMPONENT_NAMES)[number],
    unknown
>;

export interface ResourceLoaderRequire {
    (module: "vue"): VueModule;
    (module: "@wikimedia/codex"): CodexComponents;
}

export function registerPageAssessorComponents(
    app: VueApp,
    Codex: CodexComponents,
): void {
    registerCodexComponents(app, Codex, COMPONENT_NAMES);
}
