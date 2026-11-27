import { revisionUrl, type SourceCache } from "./source-data.ts";
import type { SourceMatch } from "./source-match.ts";
import { SOURCE_URL, httpUrl } from "./source-table.ts";

export const BADGE_CLASS = "wpvg-source-badge";
const LABELS = {
    reliable: "可靠",
    situational: "視情況而定",
    unreliable: "不可靠",
    inconclusive: "討論未有定論",
    review: "需核對適用條件",
    conflict: "比對有歧義",
    unknown: "未匹配來源表",
    loading: "讀取資料中",
    unavailable: "資料無法取得",
} as const;

export type BadgeStatus = keyof typeof LABELS;
export type AnnotationResult = SourceMatch & { badgeStatus: BadgeStatus };
type SelectedReview = { name: string; result: AnnotationResult } | null;

interface DialogView {
    cache: SourceCache | null;
    stale: boolean;
    loading: boolean;
    error: string;
    saveError: string;
    showUnknown: boolean;
    selected: SelectedReview;
    counts: Map<BadgeStatus, number>;
}

export const BADGE_STYLE = `
    .${BADGE_CLASS} {
        all: initial;
        display: inline-flex;
        box-sizing: border-box;
        margin: 3px 0 3px 8px;
        padding: 3px 7px;
        border: 1px solid currentColor;
        border-radius: 5px;
        background: #f3f4f6;
        color: #374151;
        font: 600 11px/1.45 system-ui, sans-serif;
        vertical-align: middle;
        cursor: pointer;
    }
    .${BADGE_CLASS}:focus-visible {
        outline: 3px solid #2563eb;
        outline-offset: 2px;
    }
    .${BADGE_CLASS}[data-status="reliable"] { background: #ecfdf5; color: #065f46; }
    .${BADGE_CLASS}[data-status="situational"],
    .${BADGE_CLASS}[data-status="review"] { background: #fffbeb; color: #92400e; }
    .${BADGE_CLASS}[data-status="unreliable"] { background: #fef2f2; color: #991b1b; }
    .${BADGE_CLASS}[data-status="inconclusive"],
    .${BADGE_CLASS}[data-status="conflict"] { background: #f5f3ff; color: #5b21b6; }
    .${BADGE_CLASS}[hidden] { display: none !important; }
`;

const panelStyle = `
    :host { all: initial; font: 14px/1.6 system-ui, sans-serif; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; }
    button {
        padding: 7px 11px;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        background: #fff;
        color: #0f172a;
        font: inherit;
        cursor: pointer;
    }
    button[aria-disabled="true"] { opacity: .65; cursor: wait; }
    button:focus-visible, a:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
    .launcher {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 2147483000;
        max-width: calc(100vw - 28px);
        background: #0f172a;
        border-color: #475569;
        color: #fff;
        box-shadow: 0 3px 14px #0003;
    }
    dialog {
        position: fixed;
        inset: 0;
        z-index: 2147483640;
        width: min(680px, calc(100vw - 28px));
        max-height: calc(100vh - 40px);
        margin: auto;
        padding: 22px;
        overflow: auto;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background: #fff;
        color: #0f172a;
        font: 14px/1.65 system-ui, sans-serif;
        box-shadow: 0 14px 60px #0004;
    }
    dialog::backdrop { background: #0f172a99; }
    h2 { margin: 0; font-size: 20px; overflow-wrap: anywhere; }
    h3 { margin: 16px 0 6px; font-size: 16px; overflow-wrap: anywhere; }
    p { margin: 8px 0; }
    header, .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    header { justify-content: space-between; align-items: start; }
    .actions { margin-top: 18px; }
    .status { padding: 10px; background: #f1f5f9; border-radius: 6px; }
    .warning { color: #92400e; }
    .note { white-space: pre-wrap; overflow-wrap: anywhere; }
    .small { font-size: 12px; color: #475569; }
    a { color: #1d4ed8; }
    ul { padding-inline-start: 22px; }
    li { margin: 4px 0; }
    section { border-top: 1px solid #e2e8f0; margin-top: 16px; }
`;

export function resultLabel(result: AnnotationResult): string {
    return result.badgeStatus === "review" && result.status !== "unknown"
        ? `${LABELS[result.status]}／查條件`
        : LABELS[result.badgeStatus];
}

const timeFormat = new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
});

export function formatTime(timestamp: number): string {
    return timeFormat.format(timestamp);
}

function element<K extends keyof HTMLElementTagNameMap>(
    document: Document,
    tag: K,
    text = "",
    className = "",
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
}

function addLink(parent: HTMLElement, label: string, href: string): void {
    const url = httpUrl(href);
    if (!url) return;
    const link = element(parent.ownerDocument, "a", label);
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    parent.append(link);
}

function renderDataStatus(parent: HTMLElement, view: DialogView): void {
    const document = parent.ownerDocument;
    const status = element(document, "div", "", "status");
    status.setAttribute("role", "status");
    if (view.cache) {
        const { fetchedAt, revision, records } = view.cache;
        status.append(
            element(
                document,
                "p",
                `資料取得於 ${formatTime(fetchedAt)}，共 ${records.length} 筆來源。`,
            ),
        );
        addLink(status, `查看來源版本 ${revision}`, revisionUrl(revision));
        if (view.stale)
            status.append(
                element(document, "p", "快取已超過 24 小時。", "warning"),
            );
    } else if (!view.loading) {
        status.append(element(document, "p", "尚未取得來源表。"));
    }
    if (view.loading)
        status.append(element(document, "p", "正在讀取英文維基百科來源表。"));
    const errors = [view.error, view.saveError].filter(Boolean).join(" ");
    if (errors) status.append(element(document, "p", errors, "warning"));
    const current = element(document, "p");
    addLink(current, "開啟目前的維基百科來源表", SOURCE_URL);
    status.append(current);
    parent.append(status);
}

function renderSummary(
    parent: HTMLElement,
    counts: DialogView["counts"],
): void {
    const document = parent.ownerDocument;
    parent.append(element(document, "h3", "目前載入的評論"));
    if (!counts.size) {
        parent.append(element(document, "p", "尚未找到評論卡片。"));
        return;
    }
    const list = element(document, "ul");
    for (const key of Object.keys(LABELS) as BadgeStatus[]) {
        const count = counts.get(key);
        if (count)
            list.append(
                element(document, "li", `${LABELS[key]} · ${count} 則`),
            );
    }
    parent.append(list);
}

function renderReviewDetails(
    parent: HTMLElement,
    result: AnnotationResult,
    cache: SourceCache | null,
): void {
    const document = parent.ownerDocument;
    parent.append(
        element(document, "h3", `來源分類 · ${resultLabel(result)}`),
    );
    const methods = {
        domain: "原文連結的網域與路徑",
        name: "來源名稱",
        "name+domain": "來源名稱及原文連結的網域與路徑",
    };
    if (result.matchedBy)
        parent.append(
            element(document, "p", `比對依據為${methods[result.matchedBy]}。`),
        );
    if (result.conflict) {
        parent.append(
            element(
                document,
                "p",
                "名稱或原文連結指向多個來源項目，請查閱下列記錄。",
                "warning",
            ),
        );
    } else if (result.requiresReview) {
        parent.append(
            element(
                document,
                "p",
                "請依評論日期、作者與內容類型核對下列記錄的適用條件。",
                "warning",
            ),
        );
    } else if (result.scopeMismatch) {
        parent.append(
            element(
                document,
                "p",
                "名稱相符，原文連結的網域或路徑超出來源表所列範圍。",
                "warning",
            ),
        );
    } else if (result.badgeStatus === "unknown") {
        parent.append(
            element(document, "p", "來源表中未找到相符的名稱或原文連結。"),
        );
    }
    for (const record of result.records) {
        const block = element(document, "section");
        block.append(
            element(
                document,
                "h3",
                `${record.name} · ${LABELS[record.status]}`,
            ),
        );
        const context = [record.section, record.subsection, record.dates]
            .filter(Boolean)
            .join(" / ");
        if (context) block.append(element(document, "p", context, "small"));
        if (record.primary) {
            block.append(
                element(
                    document,
                    "p",
                    "原表將此來源列為第一方或關聯來源。",
                    "warning",
                ),
            );
        }
        if (record.notes) {
            block.append(
                element(document, "p", "原表備註與限制", "small"),
                element(document, "p", record.notes, "note"),
            );
        }
        if (record.contextNotes) {
            block.append(
                element(document, "p", "所屬章節的共同限制", "small"),
                element(document, "p", record.contextNotes, "note"),
            );
        }
        if (cache)
            addLink(
                block,
                "查看這筆資料的來源版本",
                revisionUrl(cache.revision, record.anchor),
            );
        if (record.discussions.length) {
            const links = element(document, "p", "相關討論 ");
            record.discussions.forEach((href, index) => {
                if (index) links.append(" · ");
                addLink(links, String(index + 1), href);
            });
            block.append(links);
        }
        parent.append(block);
    }
}

export function createInterface(
    document: Document,
    actions: {
        summary: () => void;
        refresh: () => void;
        toggleUnknown: () => void;
    },
) {
    const host = element(document, "div");
    host.id = "wpvg-source-controls";
    host.dataset.wpvgOwned = "true";
    const shadow = host.attachShadow({ mode: "open" });
    const launcher = element(document, "button", "WPVG", "launcher");
    launcher.type = "button";
    launcher.title = "查看來源表狀態與設定";
    launcher.setAttribute("aria-haspopup", "dialog");
    launcher.addEventListener("click", actions.summary);
    const dialog = element(document, "dialog");
    const header = element(document, "header");
    const heading = element(document, "h2");
    heading.id = "wpvg-dialog-title";
    dialog.setAttribute("aria-labelledby", heading.id);
    const closeButton = element(document, "button", "關閉");
    closeButton.type = "button";
    closeButton.addEventListener("click", close);
    header.append(heading, closeButton);
    const intro = element(
        document,
        "p",
        "標籤採用英文維基百科電玩專題的引用來源分類。請依評論日期、作者、內容與原表備註核對其適用範圍。",
    );
    const content = element(document, "div");
    const buttons = element(document, "div", "", "actions");
    const refresh = element(document, "button", "立即更新來源表");
    refresh.type = "button";
    refresh.addEventListener("click", () => {
        if (refresh.getAttribute("aria-disabled") !== "true")
            actions.refresh();
    });
    const toggle = element(document, "button");
    toggle.type = "button";
    toggle.addEventListener("click", actions.toggleUnknown);
    buttons.append(refresh, toggle);
    const credits = element(
        document,
        "p",
        "來源資料由英文維基百科貢獻者提供，依 ",
        "small",
    );
    addLink(
        credits,
        "CC BY-SA 4.0",
        "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    credits.append(" 授權。概念參考 ");
    addLink(
        credits,
        "Cite Unseen",
        "https://meta.wikimedia.org/wiki/Cite_Unseen",
    );
    credits.append("。");
    dialog.append(header, intro, content, buttons, credits);
    shadow.append(element(document, "style", panelStyle), launcher, dialog);

    let origin: HTMLElement | null = null;
    dialog.addEventListener("close", () => {
        if (dialog.open) return;
        if (origin?.isConnected) origin.focus();
        origin = null;
    });
    dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
        )
            close();
    });

    function close(): void {
        if (dialog.open) dialog.close();
    }

    function open(trigger: HTMLElement): void {
        if (dialog.open) return;
        origin = trigger;
        dialog.showModal();
        closeButton.focus();
    }

    function render(view: DialogView): void {
        const focused = shadow.activeElement;
        const restoreFocus = content.contains(focused);
        const href = focused?.getAttribute("href");
        heading.textContent = view.selected?.name || "WPVG 遊戲評論來源標註";
        refresh.textContent = view.loading
            ? "正在更新來源表…"
            : "立即更新來源表";
        refresh.setAttribute("aria-disabled", String(view.loading));
        toggle.textContent = view.showUnknown
            ? "隱藏未匹配標籤"
            : "顯示未匹配標籤";
        const panel = element(document, "div");
        renderDataStatus(panel, view);
        if (view.selected)
            renderReviewDetails(panel, view.selected.result, view.cache);
        else renderSummary(panel, view.counts);
        content.replaceChildren(...Array.from(panel.childNodes));
        if (restoreFocus) {
            const link = Array.from(content.querySelectorAll("a")).find(
                (anchor) => anchor.getAttribute("href") === href,
            );
            (link ?? closeButton).focus();
        }
    }

    return { host, launcher, dialog, close, open, render };
}
