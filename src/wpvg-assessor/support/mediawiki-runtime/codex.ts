/**
 * @file src/wpvg-assessor/support/mediawiki-runtime/codex.ts
 * Purpose: Register a feature's Codex components on its MediaWiki Vue app.
 * Contents: Ordered component registration.
 */

import type { VueApp } from "./contracts.ts";

export function registerCodexComponents<Name extends string>(
    app: VueApp,
    components: Readonly<Record<Name, unknown>>,
    names: readonly Name[],
): void {
    for (const name of names) {
        app.component(name, components[name]);
    }
}
