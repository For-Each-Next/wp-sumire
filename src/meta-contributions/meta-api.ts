import {
    isPositiveSafeInteger,
    readActionQuery,
    readFirstRevision,
    readQueryPages,
    readRecord,
} from "@for-each-next/wp/mediawiki";
import {
    parseContributions,
    renderContributionItem,
    type ContributionEntry,
    type ContributionSection,
    type ContributionSectionId,
} from "./contributions.ts";
import { suggestContributionSummary } from "./edit-summary.ts";
import {
    parseProfileRecords,
    profileHeadings,
    profileRecordSectionIds,
    renderProfileRecordItem,
    showAllQuotations,
    type ProfileRecord,
    type ProfileRecordSection,
    type ProfileRecordSectionId,
    type ProfileSectionId,
} from "./profile-records.ts";
import { ProfileFormatError } from "./profile-wikitext.ts";

export const PROFILE_OWNER = "For Each ... Next";
export const PROFILE_TITLE = `User:${PROFILE_OWNER}`;
export const META_ORIGIN = "https://meta.wikimedia.org";
export const META_API_URL = `${META_ORIGIN}/w/api.php`;
export const META_PROFILE_URL = `${META_ORIGIN}/wiki/User:For_Each_..._Next`;

type ErrorKey =
    | "signIn"
    | "sourceFailed"
    | "unknownLayout"
    | "invalidFields"
    | "conflict"
    | "previewFailed"
    | "saveFailed";
type Parameters = Record<string, string | number | boolean>;

export interface MetaApi {
    get(parameters: Parameters): PromiseLike<unknown>;
    post(parameters: Parameters): PromiseLike<unknown>;
    postWithEditToken(parameters: Parameters): PromiseLike<unknown>;
}

export interface ProfileEdits {
    contributions?: readonly ContributionSection[];
    barnstars?: readonly ProfileRecord[];
    quotations?: readonly ProfileRecord[];
    userboxes?: readonly ProfileRecord[];
}

interface ProfilePreview {
    html: string;
    sections: ProfileSectionId[];
    suggestedSummary: string;
}

export type ProfileItem = { number?: number } & (
    | {
          section: "contributions";
          group: ContributionSectionId;
          defaultSite: string;
          entry: ContributionEntry;
      }
    | {
          section: ProfileRecordSectionId;
          defaultSite: string;
          entry: ProfileRecord;
      }
);

export function profileItemSource(item: ProfileItem): string {
    return item.section === "contributions"
        ? renderContributionItem(
              item.group,
              item.defaultSite,
              item.entry,
              item.number,
          )
        : renderProfileRecordItem(
              item.section,
              item.defaultSite,
              item.entry,
              item.number,
          );
}

export interface MetaProfile {
    contributions: {
        sections: ContributionSection[];
        needsNumbering: boolean;
        suggestSummary(sections: readonly ContributionSection[]): string;
    } | null;
    barnstars: ProfileRecordSection | null;
    quotations: ProfileRecordSection | null;
    userboxes: ProfileRecordSection | null;
    preview(edits: ProfileEdits): Promise<ProfilePreview>;
    previewItem(source: string): Promise<string>;
    save(edits: ProfileEdits, summary?: string): Promise<string>;
}

export class MetaContributionsError extends Error {
    readonly key: ErrorKey;

    constructor(key: ErrorKey, cause?: unknown) {
        super(key, { cause });
        this.key = key;
    }
}

const accountAssertion = { assert: "user", assertuser: PROFILE_OWNER };

function apiFailure(
    error: unknown,
    fallback: ErrorKey,
): MetaContributionsError {
    const details = error as {
        error?: { code?: unknown };
        code?: unknown;
    } | null;
    const code =
        typeof error === "string"
            ? error
            : (details?.error?.code ?? details?.code);
    if (code === "editconflict" || code === "pagedeleted") {
        return new MetaContributionsError("conflict", error);
    }
    if (
        code === "assertuserfailed" ||
        code === "assertnameduserfailed" ||
        code === "notloggedin" ||
        code === "badtoken" ||
        (typeof code === "string" && code.includes("centralauth"))
    ) {
        return new MetaContributionsError("signIn", error);
    }
    return new MetaContributionsError(fallback, error);
}

function revisionUrl(
    revisionId: number,
    sections: readonly ProfileSectionId[],
): string {
    const [id] = sections;
    const fragment =
        sections.length === 1 && id !== "userboxes"
            ? `#${profileHeadings[id]}`
            : "";
    return `${META_ORIGIN}/wiki/Special:PermaLink/${revisionId}${fragment}`;
}

function optionalSection<T>(parse: () => T): T | null {
    try {
        return parse();
    } catch (error) {
        if (error instanceof ProfileFormatError) return null;
        throw error;
    }
}

function profileSummary(
    sections: readonly ProfileSectionId[],
    contributionSummary: string,
): string {
    if (!sections.length) return "";
    if (sections.length === 1) {
        const [id] = sections;
        if (id === "contributions") return contributionSummary;
        if (id === "userboxes") return "Updated userboxes.";
        return `/* ${profileHeadings[id]} */ Updated records.`;
    }
    const headings = sections.map((id) => profileHeadings[id]);
    const last = headings.pop();
    return `Updated ${headings.join(", ")} and ${last}.`;
}

async function parsePreview(api: MetaApi, text: string): Promise<string> {
    let result: unknown;
    try {
        result = await api.post({
            action: "parse",
            formatversion: 2,
            title: PROFILE_TITLE,
            text,
            contentmodel: "wikitext",
            prop: "text",
            preview: true,
            disableeditsection: true,
            disabletoc: true,
            ...accountAssertion,
        });
    } catch (error) {
        throw apiFailure(error, "previewFailed");
    }
    const html = readRecord(readRecord(result)?.parse)?.text;
    if (typeof html !== "string" || !html.trim())
        throw new MetaContributionsError("previewFailed");
    return html;
}

export async function readMetaProfile(api: MetaApi): Promise<MetaProfile> {
    let source: unknown;
    try {
        source = await api.get({
            action: "query",
            prop: "revisions",
            titles: PROFILE_TITLE,
            rvslots: "main",
            rvprop: "ids|content|contentmodel",
            ...accountAssertion,
        });
    } catch (error) {
        throw apiFailure(error, "sourceFailed");
    }
    const page = readQueryPages(readActionQuery(source))?.[0] ?? null;
    const revision = readFirstRevision(page);
    const slot = readRecord(readRecord(revision?.slots)?.main);
    if (
        page?.title !== PROFILE_TITLE ||
        page.ns !== 2 ||
        !isPositiveSafeInteger(revision?.revid) ||
        slot?.contentmodel !== "wikitext" ||
        typeof slot.content !== "string"
    ) {
        throw new MetaContributionsError("sourceFailed");
    }

    const original = slot.content;
    const baseRevision = revision.revid;
    const parsedContributions = optionalSection(() =>
        parseContributions(original),
    );
    const contributions = parsedContributions && {
        sections: parsedContributions.sections,
        needsNumbering: parsedContributions.numberingNeeded.length > 0,
        suggestSummary: (sections: readonly ContributionSection[]) =>
            suggestContributionSummary(
                parsedContributions.sections,
                sections,
                parsedContributions.numberingNeeded,
            ),
    };
    const records = {
        barnstars: optionalSection(() =>
            parseProfileRecords(original, "barnstars"),
        ),
        quotations: optionalSection(() =>
            parseProfileRecords(original, "quotations"),
        ),
        userboxes: optionalSection(() =>
            parseProfileRecords(original, "userboxes"),
        ),
    };

    function prepareText(edits: ProfileEdits, forPreview = false) {
        let text = original;
        const requested: ProfileSectionId[] = [];
        const changed: ProfileSectionId[] = [];
        let contributionSummary = "";
        try {
            if (edits.contributions !== undefined) {
                if (!parsedContributions || !contributions) {
                    throw new ProfileFormatError(
                        "The Contributions section is unavailable.",
                    );
                }
                requested.push("contributions");
                text = parsedContributions.withSections(
                    edits.contributions,
                    true,
                );
                if (text !== original) {
                    changed.push("contributions");
                    contributionSummary = contributions.suggestSummary(
                        edits.contributions,
                    );
                }
            }
            for (const id of profileRecordSectionIds) {
                const entries = edits[id];
                if (entries === undefined) continue;
                const originalSection = records[id];
                if (!originalSection)
                    throw new ProfileFormatError(
                        `The ${profileHeadings[id]} section is unavailable.`,
                    );
                requested.push(id);
                // Earlier edits can shift this template's offsets within the page.
                const section =
                    text === original
                        ? originalSection
                        : parseProfileRecords(text, id);
                const updated = section.withEntries(entries);
                if (updated !== text) changed.push(id);
                text = updated;
            }
            const sections = changed.length ? changed : requested;
            if (forPreview && sections.includes("quotations"))
                text = showAllQuotations(text);
            return {
                text,
                sections,
                suggestedSummary: profileSummary(changed, contributionSummary),
            };
        } catch (error) {
            throw new MetaContributionsError("invalidFields", error);
        }
    }

    const { barnstars, quotations, userboxes } = records;
    return {
        contributions,
        barnstars: barnstars && {
            defaultSite: barnstars.defaultSite,
            entries: barnstars.entries,
            needsNumbering: barnstars.needsNumbering,
        },
        quotations: quotations && {
            defaultSite: quotations.defaultSite,
            entries: quotations.entries,
            needsNumbering: quotations.needsNumbering,
        },
        userboxes: userboxes && {
            defaultSite: userboxes.defaultSite,
            entries: userboxes.entries,
            needsNumbering: userboxes.needsNumbering,
        },
        async preview(edits) {
            const { text, sections, suggestedSummary } = prepareText(
                edits,
                true,
            );
            const html = await parsePreview(api, text);
            return { html, sections, suggestedSummary };
        },
        previewItem(source) {
            return parsePreview(
                api,
                [
                    "{{/|profile_header|lang=en}}",
                    source,
                    "{{/|profile_footer}}",
                ].join("\n"),
            );
        },
        async save(edits, summary) {
            const { text, sections, suggestedSummary } = prepareText(edits);
            if (text === original) return revisionUrl(baseRevision, sections);

            let result: unknown;
            try {
                result = await api.postWithEditToken({
                    action: "edit",
                    title: PROFILE_TITLE,
                    text,
                    summary:
                        summary?.replace(/\r\n|\n|\r/gu, " ").trim() ||
                        suggestedSummary,
                    baserevid: baseRevision,
                    nocreate: true,
                    watchlist: "nochange",
                    ...accountAssertion,
                });
            } catch (error) {
                throw apiFailure(error, "saveFailed");
            }
            const edit = readRecord(readRecord(result)?.edit);
            if (edit?.result === "Success") {
                if (edit.nochange === true) {
                    return revisionUrl(baseRevision, sections);
                }
                if (isPositiveSafeInteger(edit.newrevid)) {
                    return revisionUrl(edit.newrevid, sections);
                }
            }
            throw new MetaContributionsError("saveFailed");
        },
    };
}
