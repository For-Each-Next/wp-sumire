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

interface RevisionPosition {
    revisionId: number;
    timestamp: string;
}

export interface WikitextRevision extends RevisionPosition {
    title: string;
    pageId: number;
    namespace: number;
    text: string;
}

interface TargetEdit {
    startTimestamp: string;
    revision: WikitextRevision | null;
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
const COPY_SUMMARY =
    /^拷貝自\[\[([^\]]+)\]\]（\[\[Special:PermaLink\/(\d+)\|(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC\]\]版）/u;
const WIKITEXT_PROPERTIES = "ids|timestamp|content|contentmodel";
const FILE_NAMESPACE = 6;
const TITLE_LIMIT = 50;

function isTimestamp(value: unknown): value is string {
    return typeof value === "string" && ISO_TIMESTAMP.test(value);
}

function readWikitextRevision(
    page: Record<string, unknown> | null,
): WikitextRevision | null {
    const revision = readFirstRevision(page);
    const slot = readRecord(readRecord(revision?.slots)?.main);
    if (
        typeof page?.title !== "string" ||
        !isPositiveSafeInteger(page.pageid) ||
        typeof page.ns !== "number" ||
        !isPositiveSafeInteger(revision?.revid) ||
        !isTimestamp(revision.timestamp) ||
        slot?.contentmodel !== "wikitext" ||
        typeof slot.content !== "string"
    ) {
        return null;
    }
    return {
        title: page.title,
        pageId: page.pageid,
        namespace: page.ns,
        revisionId: revision.revid,
        timestamp: revision.timestamp,
        text: slot.content,
    };
}

async function readRevision(api: WikiApi, revisionId: number) {
    const result = await api.get({
        action: "query",
        prop: "revisions",
        revids: revisionId,
        rvprop: WIKITEXT_PROPERTIES,
        rvslots: "main",
    });
    const page = readQueryPages(readActionQuery(result))?.[0] ?? null;
    const revision = readWikitextRevision(page);
    return revision?.revisionId === revisionId ? revision : null;
}

export async function readSource(
    mw: MediaWiki,
    api: WikiApi,
    context: SourceContext,
): Promise<WikitextRevision> {
    const revision = await readRevision(api, context.revisionId);
    if (
        !revision ||
        revision.pageId !== context.pageId ||
        revision.namespace !== context.title.getNamespaceId() ||
        mw.Title.newFromText(revision.title)?.getPrefixedText() !==
            context.title.getPrefixedText()
    ) {
        throw new DraftCopyError("sourceUnavailable");
    }
    return revision;
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
        rvprop: WIKITEXT_PROPERTIES,
        rvslots: "main",
        curtimestamp: true,
        meta: "tokens",
        type: "csrf",
    });
    const query = readActionQuery(result);
    const page = readQueryPages(query)?.[0] ?? null;
    const startTimestamp = readRecord(result)?.curtimestamp;
    const token = readRecord(query?.tokens)?.csrftoken;
    if (
        typeof page?.title !== "string" ||
        mw.Title.newFromText(page.title)?.getPrefixedText() !==
            target.getPrefixedText() ||
        page.ns !== target.getNamespaceId() ||
        (page.contentmodel && page.contentmodel !== "wikitext") ||
        !isTimestamp(startTimestamp) ||
        typeof token !== "string" ||
        !token
    ) {
        throw new DraftCopyError("targetUnavailable");
    }
    const missing = page.missing === true;
    const revision = missing ? null : readWikitextRevision(page);
    if (!missing && !revision) {
        throw new DraftCopyError("targetUnavailable");
    }
    const optionEnabled = (name: string) =>
        Boolean(Number(mw.user.options.get(name)));
    return {
        startTimestamp,
        revision,
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

interface CopyRecord extends RevisionPosition {
    copied: RevisionPosition;
}

function isAfter(a: RevisionPosition, b: RevisionPosition): boolean {
    return (
        a.timestamp > b.timestamp ||
        (a.timestamp === b.timestamp && a.revisionId > b.revisionId)
    );
}

async function readCopyHistory(
    mw: MediaWiki,
    api: WikiApi,
    snapshot: WikitextRevision,
    other: WikitextRevision,
    historyEnd?: string,
): Promise<{ copy: CopyRecord | null; earliest: string }> {
    let earliest = snapshot.timestamp;
    if (historyEnd && earliest < historyEnd) return { copy: null, earliest };

    const otherTitle = mw.Title.newFromText(other.title)?.getPrefixedText();
    let next: ApiParameters = {};
    do {
        const result = await api.get({
            action: "query",
            prop: "revisions",
            pageids: snapshot.pageId,
            rvstartid: snapshot.revisionId,
            ...(historyEnd ? { rvend: historyEnd } : {}),
            rvlimit: "max",
            rvprop: "ids|timestamp|comment",
            ...next,
        });
        const page = readQueryPages(readActionQuery(result))?.[0];
        if (
            page?.pageid !== snapshot.pageId ||
            !Array.isArray(page.revisions)
        ) {
            throw new DraftCopyError("mergeUnavailable");
        }
        for (const value of page.revisions) {
            const revision = readRecord(value);
            if (
                !isPositiveSafeInteger(revision?.revid) ||
                !isTimestamp(revision.timestamp)
            ) {
                throw new DraftCopyError("mergeUnavailable");
            }
            const position = {
                revisionId: revision.revid,
                timestamp: revision.timestamp,
            };
            if (isAfter(position, snapshot)) continue;
            earliest = revision.timestamp;
            const attribution =
                typeof revision.comment === "string"
                    ? COPY_SUMMARY.exec(revision.comment)
                    : null;
            if (!attribution) continue;
            const copied = {
                revisionId: Number(attribution[2]),
                timestamp: `${attribution[3]}T${attribution[4]}Z`,
            };
            if (
                isPositiveSafeInteger(copied.revisionId) &&
                !isAfter(copied, other) &&
                !isAfter(copied, position) &&
                mw.Title.newFromText(attribution[1])?.getPrefixedText() ===
                    otherTitle
            ) {
                return { copy: { ...position, copied }, earliest };
            }
        }
        const continuation = readRecord(readRecord(result)?.continue);
        if (!continuation) break;
        if (
            typeof continuation.continue !== "string" ||
            typeof continuation.rvcontinue !== "string" ||
            !continuation.rvcontinue ||
            continuation.rvcontinue === next.rvcontinue
        ) {
            throw new DraftCopyError("mergeUnavailable");
        }
        next = {
            continue: continuation.continue,
            rvcontinue: continuation.rvcontinue,
        };
    } while (next.rvcontinue);
    return { copy: null, earliest };
}

export async function readCopyBase(
    mw: MediaWiki,
    api: WikiApi,
    article: WikitextRevision,
    draft: WikitextRevision,
): Promise<WikitextRevision | null> {
    const draftHistory = await readCopyHistory(mw, api, draft, article);
    // The draft's creation or latest copy bounds the article history search.
    const articleHistory = await readCopyHistory(
        mw,
        api,
        article,
        draft,
        draftHistory.earliest,
    );
    const draftCopy = draftHistory.copy;
    const articleCopy = articleHistory.copy;
    const latestIsDraft =
        draftCopy && (!articleCopy || isAfter(draftCopy, articleCopy));
    const copy = latestIsDraft ? draftCopy : articleCopy;
    if (!copy) return null;

    const other = latestIsDraft ? article : draft;
    const base =
        copy.copied.revisionId === other.revisionId
            ? other
            : await readRevision(api, copy.copied.revisionId);
    if (
        !base ||
        base.pageId !== other.pageId ||
        base.namespace !== other.namespace ||
        base.timestamp !== copy.copied.timestamp
    ) {
        throw new DraftCopyError("mergeUnavailable");
    }
    return base;
}

function formTimestamp(timestamp: string): string {
    return timestamp.replace(/\D/gu, "");
}

function editSummary({
    title,
    revisionId,
    timestamp,
}: WikitextRevision): string {
    const date = timestamp.replace("T", " ").replace("Z", " UTC");
    return `拷貝自[[${title}]]（[[Special:PermaLink/${revisionId}|${date}]]版）`;
}

export function openEditReview(
    mw: MediaWiki,
    document: Document,
    target: WikiTitle,
    source: WikitextRevision,
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
        [mirroring && !edit.revision ? "wpPreview" : "wpDiff"]: "1",
        wpTextbox1: text,
        wpSummary: editSummary(source),
        wpStarttime: formTimestamp(edit.startTimestamp),
        wpEdittime: formTimestamp(
            edit.revision?.timestamp ?? edit.startTimestamp,
        ),
        editRevId: edit.revision?.revisionId ?? 0,
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
