import { startDraftCopy } from "../draft-copy/browser.ts";
import { startMetaContributions } from "../meta-contributions/browser.ts";
import { isWikimediaUrl } from "../shared/hosts.ts";
import { startWpvgSourceLabels } from "../wpvg-source-labels/browser.ts";

declare const unsafeWindow: Window | undefined;

if (isWikimediaUrl(window.location)) {
    const page = typeof unsafeWindow === "undefined" ? window : unsafeWindow;
    startDraftCopy(window, page);
    startMetaContributions(window, page);
} else {
    startWpvgSourceLabels(window);
}
