import {
    type ApiRecord,
    readActionQuery,
    readFirstRevision,
    readQueryPages,
    readRecord,
} from "@for-each-next/wp/mediawiki";
import { scanWikitext } from "../shared/wikitext-scan.ts";
import {
    articleAssessmentCodes,
    reviewCodeForAssessment,
} from "./assessment.ts";

type AssessmentReader = (
    params: Record<string, string | number>,
) => Promise<unknown>;

const assessmentCodes = new Set<string>(articleAssessmentCodes);

const classNames: ReadonlyArray<readonly [string, RegExp]> = [
    [
        "fa",
        /^(?:典[范範](?:[级級]|[条條]目)?|特(?:色(?:[条條]目)?)?|featured article)$/u,
    ],
    ["fl", /^(?:特色列表|featured list)$/u],
    ["a", /^(?:甲(?:[级級])?(?:[条條]目)?|a-class(?: article)?)$/u],
    ["al", /^(?:甲[级級]列表|a-class list)$/u],
    ["ga", /^(?:[优優]良(?:[级級]|[条條]目)?|good article)$/u],
    [
        "bplus",
        /^(?:乙上(?:[级級])?(?:[条條]目)?|b(?:\+|-plus)(?:-class)?(?: article)?)$/u,
    ],
    ["b", /^(?:乙(?:[级級])?(?:[条條]目)?|b-class(?: article)?)$/u],
    ["bl", /^(?:乙[级級]列表|b-class list)$/u],
    ["c", /^(?:丙(?:[级級])?(?:[条條]目)?|c-class(?: article)?)$/u],
    ["cl", /^(?:丙[级級]列表|c-class list)$/u],
    ["start", /^(?:初(?:[级級])?(?:[条條]目)?|start-class(?: article)?)$/u],
    ["list", /^(?:列表(?:[级級])?|list-class)$/u],
    ["stub", /^(?:小作品(?:[级級])?|stub-class(?: article)?)$/u],
    ["sl", /^(?:小列表(?:[级級])?|stub(?:-class)? list)$/u],
];

const bannerShells = new Set([
    "wikiproject banner shell",
    "multiple wikiprojects",
    "pjbs",
    "wikiproject shell",
    "wikiprojectbanners",
    "wikiprojectbannershell",
    "wpbannershell",
    "wpbs",
]);
const localizedBannerShell =
    /^(?:多[个個][专專][题題]|通用[评評][级級]|(?:[维維]基)?[专專][题題][横橫]幅)$/u;
const generalAssessment =
    /^(?:project-independent assessment|通用[评評][级級])$/u;

function assessmentCode(value: unknown): string {
    if (typeof value !== "string") return "";
    const name = value.normalize("NFKC").trim().toLowerCase();
    if (assessmentCodes.has(name)) return name;
    return classNames.find(([, pattern]) => pattern.test(name))?.[0] ?? "";
}

function agreedCode(values: unknown[]): string {
    const recorded = values.filter(
        (value) => typeof value === "string" && value.trim(),
    );
    const codes = new Set(recorded.map(assessmentCode));
    return codes.size === 1 ? [...codes][0] : "";
}

function queryPage(result: unknown): ApiRecord | null {
    const pages = readQueryPages(readActionQuery(result));
    return pages?.length === 1 ? pages[0] : null;
}

function readProjectAssessment(page: ApiRecord | null): string {
    const projects = Object.entries(readRecord(page?.pageassessments) ?? {});
    const general = projects.filter(([project]) =>
        generalAssessment.test(project.toLowerCase()),
    );
    const applicable = general.length ? general : projects;
    return agreedCode(
        applicable.map(([, assessment]) => readRecord(assessment)?.class),
    );
}

function readBannerAssessment(source: unknown): string {
    if (typeof source !== "string") return "";
    const values: string[] = [];
    for (const node of scanWikitext(source)) {
        if (node.kind !== "template") continue;
        const [head, ...parameters] = node.parts;
        const name = source
            .slice(head.start, head.end)
            .replace(/[_\s]+/gu, " ")
            .trim()
            .toLowerCase()
            .replace(/^(?:template|模板)\s*:\s*/u, "");
        if (!bannerShells.has(name) && !localizedBannerShell.test(name))
            continue;
        const classParameter = parameters
            .reverse()
            .find(
                ({ start, equals }) =>
                    equals !== undefined &&
                    source.slice(start, equals).trim().toLowerCase() ===
                        "class",
            );
        if (classParameter?.equals !== undefined) {
            values.push(
                source
                    .slice(classParameter.equals + 1, classParameter.end)
                    .replace(/<!--.*?-->/gsu, ""),
            );
        }
    }
    return agreedCode(values);
}

export async function lookupAssessment(
    articleTitle: string,
    read: AssessmentReader,
): Promise<string> {
    if (!articleTitle.trim()) return "";
    const base = {
        action: "query",
        redirects: 1,
        converttitles: 1,
        formatversion: 2,
    };
    let title = articleTitle;
    try {
        const response = await read({
            ...base,
            prop: "pageassessments",
            titles: title,
        });
        const page = queryPage(response);
        if (page && (page.ns !== 0 || page.missing || page.invalid)) return "";
        if (typeof page?.title === "string" && page.title) title = page.title;
        const code = readProjectAssessment(page);
        if (code) return code;
    } catch {
        // Some wikis do not expose PageAssessments. Their talk banner can still carry the rating.
    }

    try {
        const response = await read({
            ...base,
            prop: "revisions",
            titles: `Talk:${title}`,
            rvprop: "content",
            rvslots: "main",
        });
        const talk = queryPage(response);
        if (talk?.ns !== 1) return "";
        const revision = readFirstRevision(talk);
        const main = readRecord(readRecord(revision?.slots)?.main);
        return readBannerAssessment(main?.content);
    } catch {
        return "";
    }
}

function normalizeLinkPart(value: string): string {
    try {
        value = decodeURIComponent(value);
    } catch {
        // A literal percent sign can occur in a title or heading.
    }
    return value
        .normalize("NFKC")
        .replace(/[_\s]+/gu, " ")
        .trim()
        .toLowerCase();
}

function reviewStatus(label: string): string {
    if (
        /^(?:copy[ -]?edit(?:ing)?(?: (?:comments?|suggestions?))?|[润潤](?:色|[饰飾])(?:意[见見]|建[议議])?)$/u.test(
            label,
        )
    ) {
        return "ce";
    }
    if (
        /^(?:peer[ -]review(?: (?:comments?|suggestions?))?|同行[评評][审審](?:意[见見]|建[议議])?)$/u.test(
            label,
        )
    ) {
        return "pr";
    }
    const match =
        /^(.*?)(?:\s+(?:review|(?:re)?assessment|nomination|candidates?)|[评評](?:[审審]|[选選])|重[审審]|候[选選]|提名)$/u.exec(
            label,
        );
    const name = match?.[1].trim();
    if (!name || /^[a-z]$/u.test(name)) return "";
    return reviewCodeForAssessment(assessmentCode(name));
}

export function assessmentFromReviewLink(
    pageTitle: string,
    fragment: string,
): string {
    const heading = normalizeLinkPart(fragment)
        .replace(/^#\s*/u, "")
        .replace(/ (?:[2-9]|\d{2,})$/u, "");
    const fromHeading = reviewStatus(heading);
    if (fromHeading) return fromHeading;
    const page = normalizeLinkPart(pageTitle);
    const process =
        /^(?:wikipedia|wp|project|[维維]基百科)\s*:\s*([^/#]+)(?:[/#]|$)/u.exec(
            page,
        )?.[1];
    return process ? reviewStatus(process.trim()) : "";
}
