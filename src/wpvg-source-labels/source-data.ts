import {
    isPositiveSafeInteger,
    isRecord,
    readRecord,
} from "@for-each-next/wp/mediawiki";
import {
    MAX_SOURCE_LENGTH,
    SOURCE_TITLE,
    SOURCE_URL,
    sourceStatuses,
    type SourceRecord,
    type SourceTable,
} from "./source-table.ts";

export const CACHE_KEY = "wpvg-source-cache-v2";
export const SETTINGS_KEY = "wpvg-source-settings-v1";
export const CACHE_TTL = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 25_000;
const SOURCE_ORIGIN = new URL(SOURCE_URL).origin;

export interface SourceCache extends SourceTable {
    schema: 2;
    sourceUrl: string;
    revision: number;
    fetchedAt: number;
}

interface Response {
    status: number;
    finalUrl?: string;
    responseText: string;
}

export type SourceRequest = (options: {
    method: "GET";
    url: string;
    headers: { Accept: string };
    anonymous: true;
    timeout: number;
    onload: (response: Response) => void;
    onerror: () => void;
    onabort: () => void;
    ontimeout: () => void;
}) => { abort(): void } | undefined;

function stringArray(value: unknown): value is string[] {
    return (
        Array.isArray(value) && value.every((item) => typeof item === "string")
    );
}

function validRecord(record: unknown): record is SourceRecord {
    return (
        isRecord(record) &&
        typeof record.name === "string" &&
        record.name.length > 0 &&
        typeof record.sourceKey === "string" &&
        record.sourceKey.length > 0 &&
        sourceStatuses.some((status) => status === record.status) &&
        [
            "anchor",
            "section",
            "subsection",
            "notes",
            "contextNotes",
            "dates",
        ].every((key) => typeof record[key] === "string") &&
        typeof record.primary === "boolean" &&
        typeof record.temporal === "boolean" &&
        stringArray(record.aliases) &&
        stringArray(record.discussions) &&
        (record.scopedAliases === undefined ||
            stringArray(record.scopedAliases)) &&
        Array.isArray(record.urlRules) &&
        record.urlRules.every(
            (rule: unknown) =>
                isRecord(rule) &&
                typeof rule.host === "string" &&
                rule.host.length > 0 &&
                typeof rule.path === "string" &&
                rule.path.startsWith("/"),
        )
    );
}

export function validSourceCache(
    cache: unknown,
    now = Date.now(),
): cache is SourceCache {
    if (
        !isRecord(cache) ||
        cache.schema !== 2 ||
        cache.sourceUrl !== SOURCE_URL ||
        !isPositiveSafeInteger(cache.revision) ||
        typeof cache.fetchedAt !== "number" ||
        !Number.isFinite(cache.fetchedAt) ||
        cache.fetchedAt <= 0 ||
        cache.fetchedAt > now + 60_000 ||
        !isRecord(cache.sectionCounts) ||
        !Array.isArray(cache.records) ||
        cache.records.length < 30 ||
        cache.records.length >= 20_000
    )
        return false;

    const counts = cache.sectionCounts;
    return (
        sourceStatuses.every((status) =>
            isPositiveSafeInteger(counts[status]),
        ) &&
        sourceStatuses.reduce(
            (total, status) => total + (counts[status] as number),
            0,
        ) === cache.records.length &&
        cache.records.every(validRecord)
    );
}

export function readShowUnknown(value: unknown): boolean {
    return readRecord(value)?.showUnknown !== false;
}

export function revisionUrl(revision: number, anchor = ""): string {
    const url = new URL("/w/index.php", SOURCE_URL);
    url.searchParams.set("title", SOURCE_TITLE);
    url.searchParams.set("oldid", String(revision));
    if (anchor) url.hash = encodeURIComponent(anchor);
    return url.href;
}

export function fetchSourcePage(
    request: SourceRequest,
): Promise<{ html: string; revision: number }> {
    const url = new URL("/w/api.php", SOURCE_URL);
    url.search = new URLSearchParams({
        action: "parse",
        format: "json",
        formatversion: "2",
        page: SOURCE_TITLE,
        prop: "text|revid",
        redirects: "1",
        disableeditsection: "1",
    }).toString();
    return new Promise((resolve, reject) => {
        let handle: ReturnType<SourceRequest>;
        let settled = false;
        const timeout = setTimeout(() => {
            fail("讀取維基百科逾時，請稍後重試。");
            handle?.abort();
        }, REQUEST_TIMEOUT);

        function fail(message: string) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(new Error(message));
        }

        try {
            handle = request({
                method: "GET",
                url: url.href,
                headers: { Accept: "application/json" },
                anonymous: true,
                timeout: REQUEST_TIMEOUT,
                onabort: () => fail("讀取來源表已取消。"),
                onerror: () => fail("無法連線至英文維基百科。"),
                ontimeout: () => fail("讀取維基百科逾時。"),
                onload: ({ status, finalUrl, responseText }) => {
                    if (settled) return;
                    try {
                        if (
                            status !== 200 ||
                            new URL(finalUrl || url.href).origin !==
                                SOURCE_ORIGIN
                        ) {
                            throw new Error(
                                `來源表回應異常（HTTP ${status}）。`,
                            );
                        }
                        if (
                            typeof responseText !== "string" ||
                            responseText.length > MAX_SOURCE_LENGTH
                        ) {
                            throw new Error("來源表回應格式或大小異常。");
                        }
                        const data = readRecord(JSON.parse(responseText));
                        const parse = readRecord(data?.parse);
                        if (
                            typeof parse?.text !== "string" ||
                            !isPositiveSafeInteger(parse.revid)
                        ) {
                            throw new Error("維基百科未回傳完整來源表。");
                        }
                        settled = true;
                        clearTimeout(timeout);
                        resolve({ html: parse.text, revision: parse.revid });
                    } catch (error) {
                        fail(
                            error instanceof SyntaxError
                                ? "維基百科回傳的資料格式無效。"
                                : (error as Error).message,
                        );
                    }
                },
            });
        } catch {
            fail("無法啟動來源表請求。");
        }
    });
}
