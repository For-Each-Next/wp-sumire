/**
 * @file src/wpvg-assessor/app/browser.ts
 * Purpose: Browser entry point for the Article Assessor gadget.
 *
 * Contents: MediaWiki readiness and startup dispatch.
 */

import { assessorWikiOrigin } from "../../shared/hosts.ts";
import { startOnWiki } from "../../shared/wiki-startup.ts";
import { isAssessorExternalSource } from "../domain/source-links.ts";
import { installAssessorSourceLinks } from "../platform/browser/source-links.ts";
import { start } from "./main.ts";

type AssessorPage = Window & { mw?: typeof mw };

export function startArticleAssessor(
    browser: Window,
    page: AssessorPage = browser,
): void {
    const { href, origin } = browser.location;
    if (origin !== assessorWikiOrigin && !isAssessorExternalSource(href))
        return;

    installAssessorSourceLinks(page, browser.document);
    if (origin === assessorWikiOrigin) {
        startOnWiki(browser, page, "wpvg-assessor", async (wiki) => {
            start(wiki, page);
        });
    }
}
