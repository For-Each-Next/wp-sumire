/**
 * @file scripts/wpvg-assessor/capture-browser.mjs
 * Purpose: Prepare the browser for live Wikimedia documentation captures.
 * Contents: Proxy selection and native language prompt dismissal.
 */

import { execFileSync } from "node:child_process";

export function configuredCaptureProxy({
    environment = process.env,
    platform = process.platform,
    readSystemProxy = () =>
        execFileSync("scutil", ["--proxy"], { encoding: "utf8" }),
} = {}) {
    const explicit = environment.SUMIRE_BROWSER_PROXY;
    if (explicit) return { server: explicit };
    if (platform !== "darwin") return undefined;
    try {
        const settings = readSystemProxy();
        const enabled =
            settings.match(/HTTPSEnable\s*:\s*(\d+)/u)?.[1] === "1";
        const host = settings.match(/HTTPSProxy\s*:\s*(\S+)/u)?.[1];
        const port = settings.match(/HTTPSPort\s*:\s*(\d+)/u)?.[1];
        return enabled && host && port
            ? { server: `http://${host}:${port}` }
            : undefined;
    } catch {
        // Keep the ordinary browser route when system proxy discovery is unavailable.
        return undefined;
    }
}

/** Dismisses wiki notices in the capture browser and records the preparation. */
export async function prepareCaptureNotices(page) {
    const preparation = {};
    const variantClose = page.locator(".va-variant-prompt__close");
    if (
        await variantClose.waitFor({ state: "visible", timeout: 5000 }).then(
            () => true,
            () => false,
        )
    ) {
        await variantClose.click();
        await page.locator(".va-variant-prompt").waitFor({ state: "hidden" });
        preparation.nativeVariantPromptDismissed = true;
    }

    const notice = page.locator("#siteNotice");
    if (!(await notice.isVisible())) return preparation;
    const localNotice = page.locator("#localNotice");
    const target = (await localNotice.isVisible()) ? localNotice : notice;
    const record = {
        selector: await target.evaluate((element) => `#${element.id}`),
        originalText: (await target.innerText()).slice(0, 500),
    };
    const controls = notice.locator(
        'button, [role="button"], a, [class*="close" i], [id*="close" i]',
    );
    const index = await controls.evaluateAll((elements) =>
        elements.findIndex((element) => {
            const { width, height } = element.getBoundingClientRect();
            const description = [
                element.className,
                element.id,
                element.getAttribute("title"),
                element.getAttribute("aria-label"),
                (element.textContent ?? "").slice(0, 80),
            ].join(" ");
            return (
                width &&
                height &&
                /close|dismiss|关闭|關閉|閉じる|×|✕/iu.test(description)
            );
        }),
    );
    if (index >= 0) {
        await controls.nth(index).click();
        record.method = "Native close control";
    } else {
        await target.evaluate((element) => {
            element.hidden = true;
            element.style.display = "none";
        });
        record.method = "Capture-only hiding of the native notice";
    }
    await target.waitFor({ state: "hidden" });
    preparation.nativeTopNotice = record;
    return preparation;
}
