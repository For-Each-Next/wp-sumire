import type {
    ContributionEntry,
    ContributionSection,
    ContributionSectionId,
} from "./contributions.ts";
import {
    assessmentLabels,
    contributionDialogMessages,
} from "./dialog-messages.ts";
import { formatPageTitle } from "./page-title.ts";
import { normalizeFieldLines } from "./profile-wikitext.ts";

export const MAX_EDIT_SUMMARY_LENGTH = 500;

const headings: Record<ContributionSectionId, string> = {
    working: "In progress",
    articles: "Articles",
    reviews: "Reviews",
};
const summaryFields = [
    ["title", "page title"],
    ["label", "display title"],
    ["site", "language code"],
    ["type", "activity"],
    ["draft", "draft page"],
    ["talk", "discussion page"],
    ["status", "assessment"],
    ["date", "date"],
] as const;
const assessmentNames = assessmentLabels(contributionDialogMessages.en);
const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

type FieldDescription = (typeof summaryFields)[number][1] | "notes";
type UpdateDetail = { lead: string; subject: string };

type Change = { section: ContributionSectionId } & (
    | { action: "added" | "removed"; name: string }
    | {
          action: "updated";
          name: string;
          fields: FieldDescription[];
          detail?: UpdateDetail;
      }
    | { action: "moved"; name: string; from: ContributionSectionId }
    | { action: "reordered" }
);

function plainTitle(value: string): string {
    const text = value.replace(/<!--[\s\S]*?-->/gu, " ");
    if (text.includes("{{")) return "";
    return formatPageTitle(text)
        .replace(
            /\[\[([^|[\]]+)(?:\|([^[\]]*))?\]\]/gu,
            (_link, target: string, label?: string) => label || target,
        )
        .replace(/<\/?[a-z][^<>]*>/giu, "")
        .replace(/'{2,}/gu, "")
        .replace(/\/\*|\*\//gu, " ")
        .replace(/[;|[\]{}<>\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
}

function quote(text: string): string {
    const characters = [...text];
    const shortened =
        characters.length > 96
            ? characters.slice(0, 95).join("").trimEnd() + "…"
            : text;
    return `“${shortened}”`;
}

function entryName(entry: ContributionEntry): string {
    const name = plainTitle(entry.label) || plainTitle(entry.title);
    return name ? quote(name) : "an entry";
}

function changedFields(
    before: ContributionEntry,
    after: ContributionEntry,
): FieldDescription[] {
    const fields: FieldDescription[] = summaryFields
        .filter(
            ([key]) =>
                normalizeFieldLines(before[key]) !==
                normalizeFieldLines(after[key]),
        )
        .map(([, label]) => label);
    const noteOrderChanged = after.noteOrigins?.some(
        (origin, index) =>
            origin !==
            (before.noteOrigins ? before.noteOrigins[index] : index),
    );
    if (
        noteOrderChanged ||
        before.notes.length !== after.notes.length ||
        before.notes.some(
            (note, index) =>
                normalizeFieldLines(note) !==
                normalizeFieldLines(after.notes[index]),
        )
    )
        fields.push("notes");
    return fields;
}

function englishDate(value: string): string | undefined {
    const date = value.trim();
    if (!date) return "unspecified";
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(date);
    return match ? `${months[Number(match[2]) - 1]} ${match[1]}` : undefined;
}

function assessmentName(value: string): string | undefined {
    const code = value.trim().toLowerCase();
    return code ? assessmentNames.get(code) : "unspecified";
}

function singleFieldDetail(
    before: ContributionEntry,
    after: ContributionEntry,
    field: FieldDescription,
    name: string,
): UpdateDetail | undefined {
    if (field === "page title") {
        const previous = plainTitle(before.title);
        const next = plainTitle(after.title);
        if (previous && next && previous !== next)
            return {
                lead: `changed the page title from ${quote(previous)} to`,
                subject: quote(next),
            };
    } else if (field === "date" || field === "assessment") {
        const previous =
            field === "date"
                ? englishDate(before.date)
                : assessmentName(before.status);
        const next =
            field === "date"
                ? englishDate(after.date)
                : assessmentName(after.status);
        if (previous && next && previous !== next)
            return {
                lead: `changed the ${field} for ${name} from ${previous} to`,
                subject: next,
            };
    }
    return undefined;
}

function locateEntries(sections: readonly ContributionSection[]) {
    return new Map(
        sections.flatMap(({ id: section, entries }) =>
            entries.map((entry) => [entry.id, { entry, section }] as const),
        ),
    );
}

function contributionChanges(
    before: readonly ContributionSection[],
    after: readonly ContributionSection[],
): Change[] {
    const beforeEntries = locateEntries(before);
    const afterEntries = locateEntries(after);
    const changes: Change[] = [];
    for (const [id, { entry, section }] of afterEntries) {
        const previous = beforeEntries.get(id);
        if (!previous) {
            changes.push({ action: "added", name: entryName(entry), section });
        } else if (previous.section !== section) {
            changes.push({
                action: "moved",
                name: entryName(entry),
                section,
                from: previous.section,
            });
        } else {
            const fields = changedFields(previous.entry, entry);
            if (fields.length) {
                const name = entryName(entry);
                const detail =
                    fields.length === 1
                        ? singleFieldDetail(
                              previous.entry,
                              entry,
                              fields[0],
                              name,
                          )
                        : undefined;
                changes.push({
                    action: "updated",
                    name,
                    section,
                    fields,
                    detail,
                });
            }
        }
    }
    for (const [id, { entry, section }] of beforeEntries) {
        if (!afterEntries.has(id))
            changes.push({
                action: "removed",
                name: entryName(entry),
                section,
            });
    }
    for (const { id: section, entries } of before) {
        const retained = entries.filter(
            ({ id }) => afterEntries.get(id)?.section === section,
        );
        const next = after
            .find(({ id }) => id === section)
            ?.entries.filter(
                ({ id }) => beforeEntries.get(id)?.section === section,
            );
        if (retained.some(({ id }, index) => id !== next?.[index]?.id))
            changes.push({ action: "reordered", section });
    }
    return changes;
}

function englishList(items: readonly string[]): string {
    if (items.length < 2) return items[0] ?? "";
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function detail(
    change: Change,
    multipleSections: boolean,
): { lead: string; subject: string; tail: string } {
    const heading = headings[change.section];
    switch (change.action) {
        case "added":
            return {
                lead: "added",
                subject: change.name,
                tail: multipleSections ? ` to ${heading}` : "",
            };
        case "removed":
            return {
                lead: "removed",
                subject: change.name,
                tail: multipleSections ? ` from ${heading}` : "",
            };
        case "moved":
            return {
                lead: "moved",
                subject: change.name,
                tail: ` from ${headings[change.from]} to ${heading}`,
            };
        case "updated":
            return {
                ...(change.detail ?? {
                    lead: `updated the ${englishList(change.fields)} for`,
                    subject: change.name,
                }),
                tail: multipleSections ? ` in ${heading}` : "",
            };
        case "reordered":
            return {
                lead: "reordered",
                subject: "entries",
                tail: multipleSections ? ` in ${heading}` : "",
            };
    }
}

function detailedClauses(
    changes: readonly Change[],
    multipleSections: boolean,
): string[] {
    const groups = new Map<
        string,
        { lead: string; subjects: string[]; tail: string }
    >();
    for (const change of changes) {
        const { lead, subject, tail } = detail(change, multipleSections);
        const key = lead + "\0" + tail;
        const group = groups.get(key);
        if (group) group.subjects.push(subject);
        else groups.set(key, { lead, subjects: [subject], tail });
    }
    return [...groups.values()].map(
        ({ lead, subjects, tail }) =>
            `${lead} ${englishList(subjects)}${tail}`,
    );
}

function abbreviatedClauses(
    changes: readonly Change[],
    detailed: readonly Change[] = [],
): string[] {
    const counts = new Map<Change["action"], number>();
    for (const { action } of changes)
        counts.set(action, (counts.get(action) ?? 0) + 1);
    return [...counts].map(([action, count]) => {
        if (action === "reordered")
            return `reordered entries in ${count} ${count === 1 ? "section" : "sections"}`;
        const number = count === 1 ? "one" : String(count);
        const more = detailed.some((change) => change.action === action)
            ? " more"
            : "";
        return `${action} ${number}${more} ${count === 1 ? "entry" : "entries"}`;
    });
}

export function suggestContributionSummary(
    before: readonly ContributionSection[],
    after: readonly ContributionSection[],
    numberingNeeded: readonly ContributionSectionId[] = [],
): string {
    // As with the source writer, a subsection omitted from the update stays unchanged.
    const selected = new Set(after.map(({ id }) => id));
    const resolved = [
        ...after,
        ...before.filter(({ id }) => !selected.has(id)),
    ];
    const changes = contributionChanges(before, resolved);
    if (!changes.length && !numberingNeeded.length) return "";

    const sections = new Set(numberingNeeded);
    for (const change of changes) {
        sections.add(change.section);
        if (change.action === "moved") sections.add(change.from);
    }
    const [section] = sections;
    const multipleSections = sections.size > 1;
    const heading = multipleSections ? "Contributions" : headings[section];
    const numbering = numberingNeeded.length
        ? [
              "updated the numbered separators in the source" +
                  (numberingNeeded.length < sections.size
                      ? ` for ${englishList(numberingNeeded.map((id) => headings[id]))}`
                      : ""),
          ]
        : [];
    const summary = (clauses: string[]) => {
        const text = englishList([...clauses, ...numbering]);
        return `/* ${heading} */ ${text[0].toUpperCase()}${text.slice(1)}.`;
    };

    const complete = summary(detailedClauses(changes, multipleSections));
    if ([...complete].length <= MAX_EDIT_SUMMARY_LENGTH) return complete;
    for (let count = Math.min(changes.length - 1, 4); count > 0; count--) {
        const detailed = changes.slice(0, count);
        const shortened = summary([
            ...detailedClauses(detailed, multipleSections),
            ...abbreviatedClauses(changes.slice(count), detailed),
        ]);
        if ([...shortened].length <= MAX_EDIT_SUMMARY_LENGTH) return shortened;
    }
    return summary(abbreviatedClauses(changes));
}
