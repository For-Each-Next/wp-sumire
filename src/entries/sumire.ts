import { startDraftCopy } from "../draft-copy/browser.ts";
import { startMetaContributions } from "../meta-contributions/browser.ts";
import { reviewHosts } from "../shared/hosts.ts";
import { startArticleAssessor } from "../wpvg-assessor/app/browser.ts";
import { startWpvgSourceLabels } from "../wpvg-source-labels/browser.ts";

declare const unsafeWindow: Window | undefined;

if (reviewHosts.includes(window.location.hostname)) {
    startWpvgSourceLabels(window);
} else {
    const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
    startDraftCopy(window, page);
    startMetaContributions(window, page);
    startArticleAssessor(window, page);
}
