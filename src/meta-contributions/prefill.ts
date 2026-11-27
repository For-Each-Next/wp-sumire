import {
    type ApiRecord,
    isPositiveSafeInteger,
    readActionQuery,
    readQueryPages,
    readRecord,
} from "@for-each-next/wp/mediawiki";
import { reviewCodeForAssessment } from "./assessment.ts";
import type {
    ContributionEntry,
    ContributionSectionId,
} from "./contributions.ts";
import {
    formatPageTitle,
    knownNamespace,
    withoutNamespace,
} from "./page-title.ts";
import {
    assessmentFromReviewLink,
    lookupAssessment,
} from "./prefill-assessment.ts";
import type { PrefillLink } from "./prefill-link.ts";

export type ContributionPrefill = Pick<
    ContributionEntry,
    "title" | "site" | "label" | "type" | "draft" | "talk" | "status"
>;

type Parameters = Record<string, string | number>;
type Read = (parameters: Parameters) => Promise<unknown>;
type PageInfo = {
    title: string;
    ns: number;
    pageid?: number;
    lastrevid?: number;
    associatedpage?: string;
    exists: boolean;
};

function withAnchor(title: string, fragment: string): string {
    return fragment ? `${title}#${fragment}` : title;
}

function canonicalTitle(title: string, namespace: number | undefined): string {
    switch (namespace) {
        case 1:
            return `Talk:${withoutNamespace(title)}`;
        case 2:
            return `User:${withoutNamespace(title)}`;
        case 118:
            return `Draft:${withoutNamespace(title)}`;
        default:
            return title;
    }
}

async function readJson(
    url: URL,
    fetcher: typeof fetch,
    signal: AbortSignal,
): Promise<unknown> {
    try {
        const response = await fetcher(url, { credentials: "omit", signal });
        if (response.ok) return await response.json();
    } catch {
        // Public lookup is optional. Keep the entered page so the form can be completed manually.
    }
    return undefined;
}

function wikiReader(
    site: string,
    fetcher: typeof fetch,
    signal: AbortSignal,
): Read {
    return (parameters) => {
        const url = new URL(`https://${site}.wikipedia.org/w/api.php`);
        url.searchParams.set("format", "json");
        url.searchParams.set("formatversion", "2");
        url.searchParams.set("origin", "*");
        for (const [name, value] of Object.entries(parameters))
            url.searchParams.set(name, String(value));
        return readJson(url, fetcher, signal);
    };
}

function readPage(page: ApiRecord): PageInfo | null {
    const { title, ns, pageid, lastrevid, associatedpage, missing, invalid } =
        page;
    if (
        typeof title !== "string" ||
        typeof ns !== "number" ||
        !Number.isSafeInteger(ns)
    ) {
        return null;
    }
    return {
        title,
        ns,
        pageid: isPositiveSafeInteger(pageid) ? pageid : undefined,
        lastrevid: isPositiveSafeInteger(lastrevid) ? lastrevid : undefined,
        associatedpage:
            typeof associatedpage === "string" ? associatedpage : undefined,
        exists: missing !== true && invalid !== true,
    };
}

function readOwnerId(query: ApiRecord | null): number | undefined {
    const users = query?.users;
    const id = Array.isArray(users) ? readRecord(users[0])?.userid : undefined;
    return isPositiveSafeInteger(id) ? id : undefined;
}

function redirectFragment(query: ApiRecord | null, title: string): string {
    const redirects = query?.redirects;
    if (!Array.isArray(redirects)) return "";
    const redirect = redirects
        .map(readRecord)
        .find((row) => row?.to === title);
    return typeof redirect?.tofragment === "string" ? redirect.tofragment : "";
}

async function isLeadingAuthor(
    site: string,
    page: PageInfo,
    userId: number | undefined,
    fetcher: typeof fetch,
    signal: AbortSignal,
): Promise<boolean | null> {
    if (
        userId === undefined ||
        page.pageid === undefined ||
        page.lastrevid === undefined
    ) {
        return null;
    }
    const target = page.title.includes("/")
        ? `page_id/${page.pageid}`
        : encodeURIComponent(page.title);
    const url = new URL(
        `https://wikiwho-api.wmcloud.org/${site}/api/v1.0.0-beta/rev_content/${target}/`,
    );
    url.searchParams.set("editor", "true");
    url.searchParams.set("origin", "*");
    const result = readRecord(await readJson(url, fetcher, signal));
    if (result?.success !== true || result.page_id !== page.pageid)
        return null;
    const revisions = result.revisions;
    const first = Array.isArray(revisions) ? readRecord(revisions[0]) : null;
    const tokens = readRecord(first?.[String(page.lastrevid)])?.tokens;
    if (!Array.isArray(tokens)) return null;

    const totals = new Map<string, number>();
    let maximum = 0;
    for (const item of tokens) {
        const token = readRecord(item);
        if (
            typeof token?.str !== "string" ||
            (typeof token.editor !== "string" &&
                typeof token.editor !== "number")
        )
            return null;
        const length = [...token.str.replace(/\s/gu, "")].length;
        if (!length) continue;
        const editor = String(token.editor);
        const total = (totals.get(editor) ?? 0) + length;
        totals.set(editor, total);
        maximum = Math.max(maximum, total);
    }
    return maximum ? totals.get(String(userId)) === maximum : null;
}

async function findDraft(
    title: string,
    owner: string,
    read: Read,
): Promise<string> {
    const result = await read({
        action: "query",
        prop: "info",
        titles: `Draft:${title}|User:${owner}/${title}`,
        redirects: 1,
        converttitles: 1,
    });
    const pages = readQueryPages(readActionQuery(result));
    const candidates =
        pages
            ?.map(readPage)
            .filter((page): page is PageInfo => page?.exists === true) ?? [];
    const draft =
        candidates.find(({ ns }) => ns === 118) ??
        candidates.find(({ ns }) => ns === 2);
    return draft ? canonicalTitle(formatPageTitle(draft.title), draft.ns) : "";
}

function centralReviewArticle(fragment: string): string {
    // The owner uses “reviewer’s comments @ article” anchors on central review pages.
    return (
        /[@＠﹫]\s*([^#]+)$/u
            .exec(fragment.replaceAll("_", " "))?.[1]
            .trim() ?? ""
    );
}

export async function prefillContribution(
    section: ContributionSectionId,
    link: PrefillLink,
    owner: string,
    fetcher: typeof fetch = fetch,
): Promise<ContributionPrefill> {
    const fields: ContributionPrefill = {
        title: withAnchor(link.title, link.fragment),
        site: link.site,
        label: link.label,
        type: "",
        draft: "",
        talk: "",
        status: "",
    };
    if (!/^[a-z][a-z0-9-]*$/u.test(link.site)) return fields;

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 8_000);
    try {
        const read = wikiReader(link.site, fetcher, timeout.signal);
        const fallbackNamespace = knownNamespace(link.title);
        const result = await read({
            action: "query",
            prop: "info",
            inprop: "associatedpage",
            titles: link.title,
            redirects: 1,
            converttitles: 1,
            ...(section === "working" && fallbackNamespace === undefined
                ? { list: "users", ususers: owner }
                : {}),
        });
        const query = readActionQuery(result);
        const row = readQueryPages(query)?.[0];
        const page = row ? readPage(row) : null;
        const namespace = page?.ns ?? fallbackNamespace;
        const title = canonicalTitle(
            formatPageTitle(page?.title || link.title),
            namespace,
        );
        const fragment =
            link.fragment || (page ? redirectFragment(query, page.title) : "");
        fields.title = withAnchor(title, fragment);
        const explicitReview = assessmentFromReviewLink(title, fragment);
        const projectReview =
            (namespace === 4 || namespace === 5) && !!explicitReview;
        const discussion =
            namespace !== undefined && namespace > 0 && namespace % 2 === 1;
        const article =
            namespace === 0
                ? title
                : namespace === 1
                  ? page?.associatedpage || withoutNamespace(title)
                  : projectReview
                    ? centralReviewArticle(fragment)
                    : "";

        if (section === "working") {
            if (discussion || projectReview) {
                fields.type = "rev";
                fields.talk = fields.title;
                fields.title = article || title;
            } else if (namespace === 118 || namespace === 2) {
                fields.type = "draft";
                fields.draft = fields.title;
                const userSubpage =
                    namespace === 2 && title.includes("/")
                        ? title.slice(title.lastIndexOf("/") + 1).trim()
                        : "";
                fields.title =
                    namespace === 118
                        ? withoutNamespace(title)
                        : userSubpage || title;
            } else if (namespace === 0 && page?.exists) {
                const leading = await isLeadingAuthor(
                    link.site,
                    page,
                    readOwnerId(query),
                    fetcher,
                    timeout.signal,
                );
                if (leading === true) {
                    fields.type = "draft";
                    fields.draft = await findDraft(title, owner, read);
                } else if (leading === false) {
                    fields.type = "ce";
                    fields.talk = page.associatedpage
                        ? canonicalTitle(
                              formatPageTitle(page.associatedpage),
                              1,
                          )
                        : "";
                }
            }
        } else {
            if (section === "reviews" && namespace === 0 && !fragment) {
                fields.title = page?.associatedpage
                    ? canonicalTitle(formatPageTitle(page.associatedpage), 1)
                    : title;
            }
            if (
                section === "reviews" &&
                projectReview &&
                article &&
                !fields.label
            )
                fields.label = article;
            if (section === "reviews" && explicitReview) {
                fields.status = explicitReview;
            } else if (article) {
                const status = await lookupAssessment(article, read);
                fields.status =
                    section === "reviews"
                        ? reviewCodeForAssessment(status)
                        : status;
            }
        }
        return fields;
    } finally {
        clearTimeout(timer);
    }
}
