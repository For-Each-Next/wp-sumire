import {
    isPositiveSafeInteger,
    readActionQuery,
    readFirstRevision,
    readQueryPages,
    readRecord,
} from "@for-each-next/wp/mediawiki";
import type { ErrorMessageKey } from "./messages.ts";
import type { FileReference, NamespaceIds } from "./wikitext.ts";

interface WikiConfig {
    wgAction: string;
    wgArticleId: number;
    wgDBname: string;
    wgDiffNewId: number;
    wgIsMainPage: boolean;
    wgIsRedirect: boolean;
    wgNamespaceIds: NamespaceIds;
    wgNamespaceNumber: number;
    wgPageContentModel: string;
    wgPageName: string;
    wgRevisionId: number;
    wgUserLanguage: string;
    wgUserVariant: string;
}

interface WikiTitle {
    getFragment(): string | null;
    getMainText(): string;
    getNamespaceId(): number;
    getPrefixedText(): string;
}

type ApiParameters = Record<string, string | number | boolean | string[]>;

interface WikiApi {
    get(parameters: ApiParameters): PromiseLike<unknown>;
    post(parameters: ApiParameters): PromiseLike<unknown>;
}

export interface MediaWiki {
    config: { get<K extends keyof WikiConfig>(name: K): WikiConfig[K] | null };
    loader: { using(modules: string[]): PromiseLike<unknown> };
    Title: {
        makeTitle(namespace: number, text: string): WikiTitle | null;
        newFromText(text: string): WikiTitle | null;
    };
    Api: new (options: { parameters: { formatversion: 2 } }) => WikiApi;
    util: {
        addPortletLink(
            portlet: string,
            href: string,
            text: string,
            id: string,
        ): HTMLLIElement | null;
        getUrl(title: string, parameters: Record<string, string>): string;
    };
    user: { options: { get(name: string): string | number | boolean | null } };
    notify(message: string, options: { type: "error" }): void;
    log?: { warn(...details: unknown[]): void };
}

interface SourceContext {
    title: WikiTitle;
    pageId: number;
    revisionId: number;
}

interface SourceRevision {
    title: string;
    revisionId: number;
    timestamp: string;
    text: string;
}

interface TargetEdit {
    startTimestamp: string;
    baseTimestamp: string;
    baseRevisionId: number;
    token: string;
    watch: boolean;
    watchExpiry?: string;
    minor: boolean;
}

export class DraftCopyError extends Error {
    readonly key: ErrorMessageKey;

    constructor(key: ErrorMessageKey) {
        super(key);
        this.key = key;
    }
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const FILE_NAMESPACE = 6;
const TITLE_LIMIT = 50;

function isTimestamp(value: unknown): value is string {
    return typeof value === "string" && ISO_TIMESTAMP.test(value);
}

export async function readSource(
    mw: MediaWiki,
    api: WikiApi,
    context: SourceContext,
): Promise<SourceRevision> {
    const result = await api.get({
        action: "query",
        prop: "revisions",
        revids: context.revisionId,
        rvprop: "ids|timestamp|content|contentmodel",
        rvslots: "main",
    });
    const page = readQueryPages(readActionQuery(result))?.[0] ?? null;
    const revision = readFirstRevision(page);
    const slot = readRecord(readRecord(revision?.slots)?.main);
    if (
        typeof page?.title !== "string" ||
        page.pageid !== context.pageId ||
        page.ns !== context.title.getNamespaceId() ||
        mw.Title.newFromText(page.title)?.getPrefixedText() !==
            context.title.getPrefixedText() ||
        revision?.revid !== context.revisionId ||
        !isTimestamp(revision.timestamp) ||
        slot?.contentmodel !== "wikitext" ||
        typeof slot.content !== "string"
    ) {
        throw new DraftCopyError("sourceUnavailable");
    }
    return {
        title: page.title,
        revisionId: revision.revid,
        timestamp: revision.timestamp,
        text: slot.content,
    };
}

export async function findLocalReferences(
    mw: MediaWiki,
    api: WikiApi,
    references: FileReference[],
): Promise<FileReference[]> {
    const referencesByTitle = new Map<string, FileReference[]>();
    for (const reference of references) {
        const file = mw.Title.makeTitle(FILE_NAMESPACE, reference.title);
        if (!file || file.getFragment()) continue;
        const title = file.getPrefixedText();
        const sameFile = referencesByTitle.get(title) ?? [];
        sameFile.push(reference);
        referencesByTitle.set(title, sameFile);
    }
    const local: FileReference[] = [];
    const groups = [...referencesByTitle];
    for (let start = 0; start < groups.length; start += TITLE_LIMIT) {
        const batch = groups.slice(start, start + TITLE_LIMIT);
        const result = await api.post({
            action: "query",
            prop: "imageinfo",
            titles: batch.map(([title]) => title),
            iiprop: "timestamp",
            redirects: true,
        });
        const query = readActionQuery(result);
        const pages = readQueryPages(query);
        if (!pages) throw new DraftCopyError("failed");

        const aliases = new Map<string, string>();
        for (const values of [query?.normalized, query?.redirects]) {
            if (values === undefined) continue;
            if (!Array.isArray(values)) throw new DraftCopyError("failed");
            for (const value of values) {
                const mapping = readRecord(value);
                if (
                    typeof mapping?.from !== "string" ||
                    typeof mapping.to !== "string"
                ) {
                    throw new DraftCopyError("failed");
                }
                aliases.set(mapping.from, mapping.to);
            }
        }
        const repositories = new Map<string, unknown>();
        for (const { title, imagerepository } of pages) {
            if (typeof title !== "string") throw new DraftCopyError("failed");
            repositories.set(title, imagerepository);
        }
        for (const [title, references] of batch) {
            let resolved = title;
            const visited = new Set<string>();
            let next = aliases.get(resolved);
            while (next !== undefined && !visited.has(resolved)) {
                visited.add(resolved);
                resolved = next;
                next = aliases.get(resolved);
            }
            if (repositories.get(resolved) === "local") {
                local.push(...references);
            }
        }
    }
    return local;
}

export async function readTarget(
    mw: MediaWiki,
    api: WikiApi,
    target: WikiTitle,
): Promise<TargetEdit> {
    const result = await api.get({
        action: "query",
        titles: target.getPrefixedText(),
        prop: "info|revisions",
        inprop: "watched",
        rvprop: "ids|timestamp",
        curtimestamp: true,
        meta: "tokens",
        type: "csrf",
    });
    const query = readActionQuery(result);
    const page = readQueryPages(query)?.[0] ?? null;
    const startTimestamp = readRecord(result)?.curtimestamp;
    const token = readRecord(query?.tokens)?.csrftoken;
    if (
        !page ||
        page.ns !== target.getNamespaceId() ||
        (page.contentmodel && page.contentmodel !== "wikitext") ||
        !isTimestamp(startTimestamp) ||
        typeof token !== "string" ||
        !token
    ) {
        throw new DraftCopyError("targetUnavailable");
    }
    const missing = page.missing === true;
    let baseRevisionId = 0;
    let baseTimestamp = startTimestamp;
    if (!missing) {
        const base = readFirstRevision(page);
        if (
            !isPositiveSafeInteger(base?.revid) ||
            !isTimestamp(base.timestamp)
        ) {
            throw new DraftCopyError("targetUnavailable");
        }
        baseRevisionId = base.revid;
        baseTimestamp = base.timestamp;
    }
    const optionEnabled = (name: string) =>
        Boolean(Number(mw.user.options.get(name)));
    return {
        startTimestamp,
        baseTimestamp,
        baseRevisionId,
        token,
        watch:
            page.watched === true ||
            optionEnabled("watchdefault") ||
            (missing && optionEnabled("watchcreations")),
        watchExpiry:
            typeof page.watchlistexpiry === "string"
                ? page.watchlistexpiry
                : undefined,
        minor: !missing && optionEnabled("minordefault"),
    };
}

function formTimestamp(timestamp: string): string {
    return timestamp.replace(/\D/gu, "");
}

function editSummary({
    title,
    revisionId,
    timestamp,
}: SourceRevision): string {
    const date = timestamp.replace("T", " ").replace("Z", " UTC");
    return `拷貝自[[${title}]]（[[Special:PermaLink/${revisionId}|${date}]]版）`;
}

export function openEditReview(
    mw: MediaWiki,
    document: Document,
    target: WikiTitle,
    source: SourceRevision,
    text: string,
    edit: TargetEdit,
    mirroring: boolean,
): void {
    const form = document.createElement("form");
    form.method = "post";
    form.action = mw.util.getUrl(target.getPrefixedText(), {
        action: "submit",
    });
    form.enctype = "multipart/form-data";
    form.hidden = true;
    // A preview or diff POST opens the regular edit form for review.
    const fields = {
        [mirroring ? "wpPreview" : "wpDiff"]: "1",
        wpTextbox1: text,
        wpSummary: editSummary(source),
        wpStarttime: formTimestamp(edit.startTimestamp),
        wpEdittime: formTimestamp(edit.baseTimestamp),
        editRevId: edit.baseRevisionId,
        wpEditToken: edit.token,
        ...(edit.watch ? { wpWatchthis: "1" } : {}),
        ...(edit.watch && edit.watchExpiry
            ? { wpWatchlistExpiry: edit.watchExpiry }
            : {}),
        ...(edit.minor ? { wpMinoredit: "1" } : {}),
        wpUltimateParam: "1",
    };
    for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        form.append(input);
    }
    document.body.append(form);
    form.submit();
}
