import {
    BADGE_CLASS,
    BADGE_STYLE,
    createInterface,
    formatTime,
    resultLabel,
    type AnnotationResult,
    type BadgeStatus,
} from "./interface.ts";
import {
    collectReviews,
    isReviewPage,
    reviewSite,
    type Review,
    type ReviewSite,
} from "./review-sites.ts";
import {
    CACHE_KEY,
    CACHE_TTL,
    SETTINGS_KEY,
    fetchSourcePage,
    readShowUnknown,
    validSourceCache,
    type SourceCache,
    type SourceRequest,
} from "./source-data.ts";
import { buildSourceIndex, matchSource } from "./source-match.ts";
import { parseSourceTable, SOURCE_URL } from "./source-table.ts";

declare const GM_getValue: (key: string) => unknown;
declare const GM_setValue: (key: string, value: unknown) => void;
declare const GM_addStyle: (css: string) => void;
declare const GM_registerMenuCommand: (
    title: string,
    callback: () => void,
) => void;
declare const GM_xmlhttpRequest: SourceRequest;

interface Annotation {
    badge: HTMLButtonElement;
    review: Review;
    result: AnnotationResult;
}

const RETRY_INTERVAL = 60 * 60 * 1000;

function readValue(key: string): unknown {
    try {
        return GM_getValue(key);
    } catch (error) {
        console.warn("[WPVG] Cannot read storage", error);
        return null;
    }
}

function start(window: Window & typeof globalThis, site: ReviewSite): void {
    const { document, location } = window;
    const stored = readValue(CACHE_KEY);
    let cache = validSourceCache(stored) ? stored : null;
    let index = cache ? buildSourceIndex(cache.records) : null;
    let showUnknown = readShowUnknown(readValue(SETTINGS_KEY));
    let refreshError = "";
    let saveError = "";
    let scanError = "";
    let update: Promise<void> | null = null;
    let lastAttempt = -Infinity;
    let route = "";
    let scanTimer: number | null = null;
    let selected: Element | null = null;
    let lastView = "";
    let styled = false;
    const annotations = new Map<Element, Annotation>();
    const ui = createInterface(document, {
        summary: openSummary,
        refresh: () => void refreshSources(),
        toggleUnknown,
    });
    const observer = new window.MutationObserver(scheduleScan);

    function activePage(): boolean {
        return isReviewPage(site, location.pathname);
    }

    function stale(): boolean {
        return !cache || Date.now() - cache.fetchedAt >= CACHE_TTL;
    }

    function routeKey(): string {
        return location.pathname + location.search;
    }

    function scheduleScan(): void {
        if (scanTimer === null)
            scanTimer = window.setTimeout(scanReviews, 150);
    }

    function maybeRefresh(): void {
        if (
            activePage() &&
            stale() &&
            Date.now() - lastAttempt >= RETRY_INTERVAL
        )
            void refreshSources();
    }

    function refreshSources(): Promise<void> {
        if (update) return update;
        lastAttempt = Date.now();
        refreshError = "";
        update = Promise.resolve().then(async () => {
            try {
                const { html, revision } =
                    await fetchSourcePage(GM_xmlhttpRequest);
                const next: SourceCache = {
                    ...parseSourceTable(document, html),
                    schema: 2,
                    sourceUrl: SOURCE_URL,
                    revision,
                    fetchedAt: Date.now(),
                };
                if (!validSourceCache(next))
                    throw new Error("來源表結構已改變。");
                const nextIndex = buildSourceIndex(next.records);
                cache = next;
                index = nextIndex;
                saveError = "";
                try {
                    GM_setValue(CACHE_KEY, next);
                } catch (error) {
                    saveError = "資料已更新，但本機快取無法儲存。";
                    console.warn("[WPVG] Cannot save cache", error);
                }
            } catch (error) {
                refreshError =
                    error instanceof Error
                        ? error.message
                        : "來源表更新失敗。";
                console.warn("[WPVG] Source refresh failed", error);
            } finally {
                update = null;
                scanReviews();
            }
        });
        updateControls();
        scheduleScan();
        return update;
    }

    function classify(review: Review): AnnotationResult {
        if (!index) {
            return {
                status: "unknown",
                matchedBy: null,
                records: [],
                conflict: false,
                scopeMismatch: false,
                requiresReview: false,
                badgeStatus: update ? "loading" : "unavailable",
            };
        }
        const match = matchSource(index, review);
        const badgeStatus = match.conflict
            ? "conflict"
            : match.requiresReview
              ? "review"
              : match.status;
        return { ...match, badgeStatus };
    }

    function paintBadge({ badge, review, result }: Annotation): void {
        const label = resultLabel(result);
        const primary =
            !result.conflict &&
            result.records.length > 0 &&
            result.records.every((record) => record.primary)
                ? "／第一方"
                : "";
        const text = `WPVG · ${label}${primary}`;
        if (badge.textContent !== text) badge.textContent = text;
        if (badge.dataset.status !== result.badgeStatus)
            badge.dataset.status = result.badgeStatus;
        const hidden = !showUnknown && result.badgeStatus === "unknown";
        if (badge.hidden !== hidden) badge.hidden = hidden;
        const accessibleLabel = `${review.name} · ${label}${primary}，查看來源依據`;
        if (badge.getAttribute("aria-label") !== accessibleLabel)
            badge.setAttribute("aria-label", accessibleLabel);
        const age = cache
            ? `資料取得於 ${formatTime(cache.fetchedAt)}${stale() ? "（舊快取）" : ""}`
            : "資料尚未取得";
        const notes = result.records
            .map((record) =>
                [record.name, record.notes, record.contextNotes]
                    .filter(Boolean)
                    .join(" — "),
            )
            .join("\n\n")
            .slice(0, 1400);
        const title = [`${review.name} · ${label}${primary}`, age, notes]
            .filter(Boolean)
            .join("\n");
        if (badge.title !== title) badge.title = title;
        const position =
            review.anchor.parentElement?.closest("a,button") ?? review.anchor;
        if (position.nextSibling !== badge) position.after(badge);
    }

    function scanReviews(): void {
        if (scanTimer !== null) window.clearTimeout(scanTimer);
        scanTimer = null;
        observer.disconnect();
        try {
            const active = activePage();
            const nextRoute = routeKey();
            if (route !== nextRoute) {
                route = nextRoute;
                selected = null;
                ui.close();
            }
            ui.host.hidden = !active;
            if (active) {
                if (!styled) {
                    GM_addStyle(BADGE_STYLE);
                    styled = true;
                }
                if (!ui.host.isConnected) document.body.append(ui.host);
            }
            const reviews = active ? collectReviews(document, site) : [];
            const current = new Set(reviews.map((review) => review.container));
            for (const [container, { badge }] of annotations) {
                if (!current.has(container)) {
                    badge.remove();
                    annotations.delete(container);
                }
            }
            if (selected && !current.has(selected)) {
                selected = null;
                ui.close();
            }
            for (const review of reviews) {
                let badge = annotations.get(review.container)?.badge;
                if (!badge) {
                    badge = document.createElement("button");
                    badge.type = "button";
                    badge.className = BADGE_CLASS;
                    badge.dataset.wpvgOwned = "true";
                    badge.setAttribute("aria-haspopup", "dialog");
                    const trigger = badge;
                    badge.addEventListener("click", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selected = review.container;
                        openDialog(trigger);
                    });
                }
                const annotation = { badge, review, result: classify(review) };
                annotations.set(review.container, annotation);
                paintBadge(annotation);
            }
            scanError = "";
        } catch (error) {
            scanError = "頁面結構無法辨識。";
            console.warn("[WPVG] Annotation failed", error);
        } finally {
            if (activePage()) {
                observer.observe(document.documentElement, {
                    subtree: true,
                    childList: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: [
                        "href",
                        "class",
                        "data-testid",
                        "aria-label",
                        "aria-hidden",
                        "hidden",
                    ],
                });
            }
            updateControls();
        }
    }

    function updateControls(): void {
        let title = `WPVG · ${annotations.size} 則`;
        if (update) title += " · 更新中";
        else if (refreshError || scanError)
            title += cache ? " · 使用快取" : " · 資料異常";
        else if (stale()) title += cache ? " · 舊快取" : " · 無資料";
        if (ui.launcher.textContent !== title) ui.launcher.textContent = title;
        if (ui.dialog.open) renderDialog();
    }

    function renderDialog(): void {
        const error = [refreshError, scanError].filter(Boolean).join(" ");
        const counts = new Map<BadgeStatus, number>();
        const item = selected ? annotations.get(selected) : null;
        if (!item) {
            for (const {
                result: { badgeStatus },
            } of annotations.values()) {
                counts.set(badgeStatus, (counts.get(badgeStatus) ?? 0) + 1);
            }
        }
        const expired = stale();
        const details = item
            ? [item.review.name, item.review.urls, item.result.badgeStatus]
            : [...counts];
        const key = JSON.stringify([
            cache?.revision,
            cache?.fetchedAt,
            expired,
            Boolean(update),
            error,
            saveError,
            showUnknown,
            Boolean(item),
            details,
        ]);
        if (lastView === key) return;
        lastView = key;
        ui.render({
            cache,
            stale: expired,
            loading: Boolean(update),
            error,
            saveError,
            showUnknown,
            counts,
            selected: item
                ? { name: item.review.name, result: item.result }
                : null,
        });
    }

    function openDialog(trigger: HTMLElement): void {
        if (!activePage() || !ui.host.isConnected) return;
        renderDialog();
        ui.open(trigger);
    }

    function openSummary(): void {
        selected = null;
        openDialog(ui.launcher);
    }

    function toggleUnknown(): void {
        showUnknown = !showUnknown;
        try {
            GM_setValue(SETTINGS_KEY, { showUnknown });
        } catch (error) {
            console.warn("[WPVG] Cannot save settings", error);
        }
        scanReviews();
    }

    GM_registerMenuCommand("WPVG · 立即更新來源表", () => {
        openSummary();
        void refreshSources();
    });
    GM_registerMenuCommand("WPVG · 顯示／隱藏未匹配標籤", toggleUnknown);
    GM_registerMenuCommand("WPVG · 來源資料狀態與說明", openSummary);

    maybeRefresh();
    scanReviews();
    window.setInterval(() => {
        if (!document.hidden) maybeRefresh();
        if (route !== routeKey()) scanReviews();
    }, 1_000);
    window.addEventListener("popstate", () => {
        maybeRefresh();
        scheduleScan();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        maybeRefresh();
        if (activePage() || route !== routeKey()) scheduleScan();
    });
}

export function startWpvgSourceLabels(
    window: Window & typeof globalThis,
): void {
    const { location, document } = window;
    const site = reviewSite(location.hostname);
    if (location.protocol !== "https:" || site === null) return;

    const marker = "data-sumire-wpvg-started";
    const run = () => {
        const root = document.documentElement;
        if (root.hasAttribute(marker)) return;
        root.setAttribute(marker, "");
        start(window, site);
    };
    if (document.body) run();
    else document.addEventListener("DOMContentLoaded", run, { once: true });
}
