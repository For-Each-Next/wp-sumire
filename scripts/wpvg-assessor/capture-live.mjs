/**
 * @file scripts/wpvg-assessor/capture-live.mjs
 * Purpose: Capture the assessment interface on live Chinese Wikipedia without saves.
 * Contents: Browser network route, live page setup, localized views, and provenance.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { format } from "prettier";
import {
    configuredCaptureProxy,
    prepareCaptureNotices,
} from "./capture-browser.mjs";
import { isWikiWriteRequest } from "./capture-request.mjs";

const directory = "docs/wpvg-assessor/images";
const bundleArtifact = "dist/wpvg-assessor.min.js";
const bundle = await readFile(bundleArtifact, "utf8");
const bundleSha256 = createHash("sha256").update(bundle).digest("hex");
const assessmentArticle = "EliGE";
const captureProfiles = {
    en: { title: assessmentArticle, view: "full" },
    "zh-Hans": { title: assessmentArticle, view: "mini" },
    "zh-Hant": { title: "Category:未评级电子游戏条目", view: "category" },
};
const supportedLocales = Object.keys(captureProfiles);
const args = process.argv.slice(2);
assert.ok(
    args.every((argument) => argument.startsWith("--locales=")),
    "Supported option: --locales=en,zh-Hans,zh-Hant",
);
const locales =
    args
        .find((argument) => argument.startsWith("--locales="))
        ?.slice(10)
        .split(",") ?? supportedLocales;
assert.ok(locales.every((locale) => supportedLocales.includes(locale)));
let previous = {};
try {
    previous = JSON.parse(
        await readFile(`${directory}/live-captures.json`, "utf8"),
    );
} catch (error) {
    if (error.code !== "ENOENT") throw error;
}
const previousPages = await Promise.all(
    (previous.pages ?? []).map(async (page) => ({
        ...page,
        bundleArtifact: page.bundleArtifact ?? previous.bundleArtifact,
        bundleSha256: page.bundleSha256 ?? previous.bundleSha256,
        browserVersion: page.browserVersion ?? previous.browserVersion,
        captures: await Promise.all(
            page.captures.map(async (capture) => ({
                ...capture,
                bundleArtifact:
                    capture.bundleArtifact ??
                    page.bundleArtifact ??
                    previous.bundleArtifact,
                bundleSha256:
                    capture.bundleSha256 ??
                    page.bundleSha256 ??
                    previous.bundleSha256,
                imageSha256:
                    capture.imageSha256 ??
                    createHash("sha256")
                        .update(
                            await readFile(`${directory}/${capture.image}`),
                        )
                        .digest("hex"),
                deviceScaleFactor: capture.deviceScaleFactor ?? 1,
            })),
        ),
    })),
);
const ledger = {
    ...previous,
    capturedAt: new Date().toISOString(),
    method: "Chromium navigation to actual Chinese Wikipedia pages, native MediaWiki/Vue/Codex/API/assets, built bundle injection, and browser screenshots. No simulated page content or API responses. No wiki saves.",
    bundleArtifact,
    bundleSha256,
    pages: previousPages,
    failures: [...(previous.failures ?? [])],
};

async function openLivePage(browser, title, locale) {
    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 1,
        colorScheme: "light",
        locale,
    });
    const page = await context.newPage();
    const edits = [];
    const revisions = new Map();
    const metadataReads = [];
    page.on("response", (response) => {
        if (!response.url().includes("/api.php") || !response.ok()) return;
        metadataReads.push(
            response
                .json()
                .then((data) => {
                    const pages = data.query?.pages;
                    for (const source of Array.isArray(pages)
                        ? pages
                        : Object.values(pages ?? {})) {
                        for (const revision of source.revisions ?? []) {
                            if (
                                typeof source.title === "string" &&
                                Number.isSafeInteger(revision.revid)
                            ) {
                                revisions.set(source.title, {
                                    title: source.title,
                                    revisionId: revision.revid,
                                    timestamp: revision.timestamp,
                                });
                            }
                        }
                    }
                })
                .catch(() => {}),
        );
    });
    const requestedLanguage =
        { "zh-Hans": "zh-cn", "zh-Hant": "zh-tw" }[locale] ?? locale;
    const url = new URL(
        `https://zh.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    );
    url.search = new URLSearchParams({
        uselang: requestedLanguage,
        useskin: "vector-2022",
    }).toString();
    await context.route("**/*", async (route) => {
        const request = route.request();
        if (isWikiWriteRequest(request)) {
            edits.push({ method: request.method(), url: request.url() });
            await route.abort("blockedbyclient");
        } else {
            await route.continue();
        }
    });
    try {
        const response = await page.goto(url.href, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });
        assert.ok(
            response?.ok(),
            `Wikipedia returned HTTP ${response?.status()}`,
        );
        await page.waitForFunction(
            () => window.mw?.loader?.using && window.mw?.config?.get,
            undefined,
            { timeout: 45000 },
        );
        await page.evaluate(() =>
            window.mw.loader.using(["mediawiki.api", "mediawiki.util"]),
        );
        const notices = await prepareCaptureNotices(page);
        await page.addScriptTag({ content: bundle });
        const opener = page.locator("#sumire-wpvg-assessor-launcher a");
        await expect(opener).toHaveCount(1, { timeout: 45000 });
        await opener.evaluate((element) => element.click());
        const config = await page.evaluate(() =>
            Object.fromEntries(
                [
                    "wgPageName",
                    "wgRevisionId",
                    "wgUserLanguage",
                    "wgContentLanguage",
                    "skin",
                ].map((key) => [key, window.mw.config.get(key)]),
            ),
        );
        return {
            context,
            page,
            edits,
            revisions,
            metadataReads,
            info: {
                title,
                locale,
                url: page.url(),
                config,
                ...notices,
                captures: [],
                bundleArtifact: ledger.bundleArtifact,
                bundleSha256,
                browserVersion: browser.version(),
            },
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}

async function capture(session, panel) {
    const { page, edits, info, revisions, metadataReads } = session;
    await page.evaluate(() => document.fonts.ready);
    const height = await panel.evaluate((element) => {
        const body = element.querySelector(".cdx-dialog__body");
        if (!body) return 768;
        body.scrollTop = 0;
        return Math.ceil(
            element.getBoundingClientRect().height +
                body.scrollHeight -
                body.clientHeight +
                48,
        );
    });
    await page.setViewportSize({ width: 1366, height: Math.max(768, height) });
    if (info.view === "category") await verifyCategoryPreview(session, panel);
    const image = `${info.view} assessment (${info.locale}).png`;
    assert.deepEqual(edits, [], "Capture must not submit wiki edits.");
    await page.screenshot({
        path: `${directory}/${image}`,
        animations: "disabled",
    });
    await Promise.allSettled(metadataReads);
    info.sourceRevisions = [...revisions.values()];
    info.captures.push({
        image,
        imageSha256: createHash("sha256")
            .update(await readFile(`${directory}/${image}`))
            .digest("hex"),
        bundleArtifact: ledger.bundleArtifact,
        bundleSha256,
        deviceScaleFactor: 1,
        viewport: page.viewportSize(),
        capturedAt: new Date().toISOString(),
    });
    console.log(
        `Live captured ${image}: ${info.title}, revision ${info.config.wgRevisionId}`,
    );
}

async function verifyCategoryPreview(session, panel) {
    const { page, info } = session;
    const frame = panel.locator("iframe");
    await expect(frame).toBeVisible({ timeout: 60000 });
    const reader = page.frameLocator("iframe");
    const article = reader.locator("#content");
    await expect(article).toContainText(/\S/u, { timeout: 60000 });
    const paragraph = article.locator("p").filter({ hasText: /\S/u }).first();
    await expect(paragraph).toBeInViewport({ timeout: 45000 });
    await expect
        .poll(
            () =>
                article.evaluate(() =>
                    [...document.images].every((image) => image.complete),
                ),
            { timeout: 45000 },
        )
        .toBe(true);
    info.previewImages = await article.evaluate(() =>
        [...document.images].map((image) => ({
            url: image.currentSrc,
            loaded: image.naturalWidth > 0,
        })),
    );
    assert.ok(
        info.previewImages.length === 0 ||
            info.previewImages.some((image) => image.loaded),
        "Native Wikimedia preview images must load.",
    );
    const contents = reader.getByRole("navigation", { name: "目錄" });
    await expect(contents).toBeVisible();
    info.contentsLinks = await contents.getByRole("link").allTextContents();
    assert.ok(info.contentsLinks.length > 1);
    info.dialogWidth = (await panel.boundingBox()).width;
    const articleFrame = reader.locator(
        ".sumire-wpvg-assessor-category-article-frame",
    );
    info.previewFrameWidth = (await articleFrame.boundingBox()).width;
    info.previewContentWidth = await article.evaluate(
        (body) => body.getBoundingClientRect().width,
    );
    assert.equal(info.dialogWidth, 1202);
    assert.equal(info.previewFrameWidth, 960);
    assert.equal(info.previewContentWidth, 948);
    await frame.screenshot({ animations: "disabled" });
}

await mkdir(directory, { recursive: true });
const proxy = configuredCaptureProxy();
const browser = await chromium.launch({
    headless: true,
    args: ["--disable-http2"],
    ...(proxy ? { proxy } : {}),
});
ledger.browserVersion = browser.version();
try {
    for (const locale of locales) {
        const { title, view } = captureProfiles[locale];
        const messages = JSON.parse(
            await readFile(`src/wpvg-assessor/i18n/${locale}.json`, "utf8"),
        );
        let session;
        ledger.failures = ledger.failures.filter(
            (failure) => failure.locale !== locale,
        );
        try {
            console.log(`Live navigation ${locale}: ${title} (${view})`);
            session = await openLivePage(browser, title, locale);
            const { page, info } = session;
            const mini = page.getByRole("region", {
                name: messages["dialog.miniMode"],
            });
            const expand = mini.getByRole("button", {
                name: messages["dialog.expand"],
                exact: true,
            });
            if (view === "full") await expand.click({ timeout: 45000 });
            const panel = view === "mini" ? mini : page.getByRole("dialog");
            await expect(panel).toBeVisible({ timeout: 45000 });
            await expect(panel).toHaveAttribute("lang", locale);
            if (view === "full") {
                await expect(
                    panel.getByRole("textbox", {
                        name: messages["dialog.readySource"],
                        exact: true,
                    }),
                ).toHaveValue(/\S/u);
            } else if (view === "mini") {
                await expect(expand).toBeEnabled();
                const stub = panel.getByRole("radio", {
                    name: messages["assessmentClass.stub"],
                    exact: true,
                });
                const previewClass = (await stub.isChecked())
                    ? "start"
                    : "stub";
                await panel
                    .getByRole("radio", {
                        name: messages[`assessmentClass.${previewClass}`],
                        exact: true,
                    })
                    .check();
                await panel
                    .getByText(messages["dialog.viewSourceChanges"], {
                        exact: true,
                    })
                    .click();
                const comparison = panel.getByRole("region", {
                    name: messages["dialog.leadDiff"],
                    exact: true,
                });
                await expect(comparison.locator("ins").first()).toBeVisible();
                info.previewClass = previewClass;
            }
            info.view = view;
            await capture(session, panel);
            assert.deepEqual(session.edits, []);
            info.edits = [...session.edits];
            ledger.pages = ledger.pages.filter(
                (page) => page.locale !== locale,
            );
            ledger.pages.push(info);
        } catch (error) {
            ledger.failures.push({ title, locale, error: error.message });
            console.error(
                `Live capture failed ${locale} ${title}: ${error.message}`,
            );
            process.exitCode = 1;
        } finally {
            await session?.context.close();
            await writeFile(
                `${directory}/live-captures.json`,
                await format(JSON.stringify(ledger), {
                    parser: "json",
                    tabWidth: 4,
                }),
            );
        }
    }
} finally {
    await browser.close();
}
