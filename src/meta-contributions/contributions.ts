import { scanWikitext, type Span } from "../shared/wikitext-scan.ts";
import { completedAssessmentCodes } from "./assessment.ts";
import {
    editableValue,
    editRecord,
    fieldValue,
    generatedField,
    headingsOf,
    normalizeValue,
    numberRecords,
    ProfileFormatError as ContributionFormatError,
    readDataTemplate,
    readDefaultSite,
    readRecords,
    renderExistingField,
    renderRecordTemplate,
    renderRecords,
    sourceText,
    type RecordSource as DataRecord,
    type RenderedLine,
} from "./profile-wikitext.ts";

export { ProfileFormatError as ContributionFormatError } from "./profile-wikitext.ts";

export type CompletedSectionId = "articles" | "reviews";
export type ContributionSectionId = "working" | CompletedSectionId;

export interface ContributionEntry<Note = string> {
    id: string;
    title: string;
    site: string;
    label: string;
    status: string;
    date: string;
    type: string;
    draft: string;
    talk: string;
    notes: Note[];
    /** Original source index for each note, or null for an insertion. */
    noteOrigins?: readonly (number | null)[];
}

export interface ContributionSection<Note = string> {
    id: ContributionSectionId;
    defaultSite: string;
    entries: ContributionEntry<Note>[];
}

const sectionInfo = {
    working: {
        heading: "in progress",
        mode: "working",
    },
    articles: {
        heading: "articles",
        mode: "contributions",
    },
    reviews: {
        heading: "reviews",
        mode: "contributions",
    },
} as const;
const sectionIds = Object.keys(sectionInfo) as ContributionSectionId[];
const fields = [
    "site",
    "title",
    "label",
    "type",
    "draft",
    "talk",
    "status",
    "date",
] as const;
type FieldKey = (typeof fields)[number];

interface RecordSource extends DataRecord {
    entry: ContributionEntry;
}

interface SectionSource {
    id: ContributionSectionId;
    defaultSite: string;
    span: Span;
    data: string;
    newline: string;
    records: RecordSource[];
}

interface RecordOrigin {
    section: SectionSource;
    record: RecordSource;
}

function readRecord(id: string, record: DataRecord): RecordSource {
    const recordFields = record.fields;
    const value = (name: FieldKey) =>
        fieldValue(recordFields.find((field) => field.name === name));
    const entry: ContributionEntry = {
        id,
        title: value("title"),
        site: value("site"),
        label: value("label"),
        status: value("status"),
        date: value("date"),
        type: value("type"),
        draft: value("draft"),
        talk: value("talk"),
        notes: recordFields
            .filter(({ name }) => name === "note")
            .map(fieldValue),
    };
    if (!entry.title.trim()) {
        throw new ContributionFormatError(
            `A contribution record has no title (${id}).`,
        );
    }
    return { ...record, entry };
}

function readPage(source: string): SectionSource[] {
    const nodes = scanWikitext(source);
    const headings = headingsOf(source, nodes);
    const contributionHeadings = headings.filter(
        ({ level, name }) => level === 2 && name === "contributions",
    );
    if (contributionHeadings.length !== 1) {
        throw new ContributionFormatError(
            "The page must have one level-two Contributions heading.",
        );
    }
    const heading = contributionHeadings[0];
    const end =
        headings.find(
            (other) =>
                other.start > heading.start && other.level <= heading.level,
        )?.start ?? source.length;
    const subsections = headings.filter(
        (other) =>
            other.level === 3 &&
            other.start >= heading.end &&
            other.start < end,
    );
    const sections: SectionSource[] = [];
    for (const [index, subsection] of subsections.entries()) {
        const id = sectionIds.find(
            (key) => sectionInfo[key].heading === subsection.name,
        );
        if (!id) continue;
        if (sections.some((section) => section.id === id)) {
            throw new ContributionFormatError(
                `The Contributions section has more than one ${subsection.name} subsection.`,
            );
        }
        const subsectionEnd = subsections[index + 1]?.start ?? end;
        const { template, span, data, newline } = readDataTemplate(
            source,
            nodes,
            { start: subsection.end, end: subsectionEnd },
            sectionInfo[id].mode,
        );
        sections.push({
            id,
            defaultSite: readDefaultSite(source, template),
            span,
            data,
            newline,
            records: readRecords(data).map((record, index) =>
                readRecord(`${id}:${index + 1}`, record),
            ),
        });
    }
    if (!sections.length)
        throw new ContributionFormatError(
            "The Contributions section has no editable subsections.",
        );
    return sections;
}

function sameValues(
    first: ContributionEntry,
    second: ContributionEntry,
    verifyRendered = false,
): boolean {
    const matches = (wanted: string, actual: string) =>
        wanted === actual ||
        (verifyRendered && editableValue(wanted) === actual);
    return (
        fields.every((key) => matches(first[key], second[key])) &&
        first.notes.length === second.notes.length &&
        first.notes.every((note, index) => matches(note, second.notes[index]))
    );
}

function normalizeEntry(entry: ContributionEntry): ContributionEntry {
    const normalized = { ...entry, notes: entry.notes.map(normalizeValue) };
    for (const key of fields) normalized[key] = normalizeValue(entry[key]);
    if (!editableValue(normalized.title).trim())
        throw new ContributionFormatError("Every contribution needs a title.");
    return normalized;
}

function renderRecord(
    newline: string,
    entry: ContributionEntry,
    origin: RecordOrigin | undefined,
): string {
    if (!origin) {
        const lines: string[] = [];
        for (const key of fields) {
            if (entry[key]) lines.push(...generatedField(key, entry[key]));
        }
        for (const note of entry.notes)
            lines.push(...generatedField("note", note));
        return lines.join(newline);
    }
    const { section, record: original } = origin;
    const noteOrderChanged = entry.noteOrigins?.some(
        (index, position) => index !== position,
    );
    if (!noteOrderChanged && sameValues(entry, original.entry))
        return sourceText(section.data, original);

    const { replaceField, update, changeField, render } = editRecord(
        section.data,
        original,
        newline,
    );
    const newField = (key: string, value: string) =>
        generatedField(key, value).map((text) => ({ text, newline }));
    const existingField = (
        field: DataRecord["fields"][number],
        value: string | null,
    ) => renderExistingField(section.data, field, value, newline);

    for (const key of fields) {
        if (entry[key] !== original.entry[key]) changeField(key, entry[key]);
    }
    const notes = original.fields.filter(({ name }) => name === "note");
    const trailingNotes: RenderedLine[] = [];
    if (entry.noteOrigins) {
        const retained = new Set(entry.noteOrigins);
        const slots: typeof notes = [];
        for (const [index, field] of notes.entries()) {
            if (retained.has(index)) slots.push(field);
            else update(field, "note", null);
        }
        // Reuse the surviving note slots so unrelated fields and gaps keep their positions.
        let slot = 0;
        const pending: RenderedLine[] = [];
        for (const [index, originalIndex] of entry.noteOrigins.entries()) {
            const value = entry.notes[index];
            if (originalIndex === null) {
                pending.push(...newField("note", value));
            } else {
                replaceField(slots[slot++], [
                    ...pending,
                    ...existingField(notes[originalIndex], value),
                ]);
                pending.length = 0;
            }
        }
        trailingNotes.push(...pending);
    } else {
        for (
            let index = 0;
            index < Math.max(notes.length, entry.notes.length);
            index++
        ) {
            if (entry.notes[index] !== original.entry.notes[index])
                update(notes[index], "note", entry.notes[index] ?? null);
        }
    }

    return render(trailingNotes);
}

export function renderContributionItem(
    group: ContributionSectionId,
    defaultSite: string,
    entry: ContributionEntry,
    number = 1,
): string {
    const normalized = normalizeEntry(entry);
    if (group === "working" && !editableValue(normalized.type).trim()) {
        throw new ContributionFormatError(
            "An in-progress contribution needs an activity type.",
        );
    }
    const data = renderRecord("\n", normalized, undefined);
    return renderRecordTemplate(
        sectionInfo[group].mode,
        data,
        group,
        number,
        defaultSite,
    );
}

function renderSection(
    section: SectionSource,
    entries: ContributionEntry[],
    origins: ReadonlyMap<string, RecordOrigin>,
): string {
    return renderRecords(
        section,
        entries.map((entry) =>
            renderRecord(section.newline, entry, origins.get(entry.id)),
        ),
    );
}

export function parseContributions(source: string): {
    sections: ContributionSection[];
    numberingNeeded: ContributionSectionId[];
    withSections(
        sections: readonly ContributionSection[],
        numberEntries?: boolean,
    ): string;
} {
    const original = readPage(source);
    const numbered = new Map(
        original.map((section) => [
            section.id,
            numberRecords(section.data, section.newline, section.id),
        ]),
    );
    const numberingNeeded = original
        .filter((section) => numbered.get(section.id) !== section.data)
        .map(({ id }) => id);
    const sections = original.map(({ id, defaultSite, records }) => ({
        id,
        defaultSite,
        entries: records.map(({ entry }) => ({
            ...entry,
            notes: [...entry.notes],
        })),
    }));
    const origins = new Map(
        original.flatMap((section) =>
            section.records.map(
                (record) => [record.entry.id, { section, record }] as const,
            ),
        ),
    );

    function withSections(
        selected: readonly ContributionSection[],
        numberEntries = false,
    ): string {
        const updates = new Map<ContributionSectionId, ContributionEntry[]>();
        const seen = new Set<string>();
        for (const section of selected) {
            const previous = original.find(({ id }) => id === section.id);
            if (
                !previous ||
                updates.has(section.id) ||
                section.defaultSite !== previous.defaultSite
            ) {
                throw new ContributionFormatError(
                    "The selected contribution subsections no longer match the page.",
                );
            }
            const entries = section.entries.map(normalizeEntry);
            for (const entry of entries) {
                if (!entry.id || seen.has(entry.id)) {
                    throw new ContributionFormatError(
                        "Each contribution entry needs a distinct ID.",
                    );
                }
                seen.add(entry.id);
            }
            updates.set(section.id, entries);
        }
        for (const [sectionId, entries] of updates) {
            for (const entry of entries) {
                const origin = origins.get(entry.id);
                const owner = origin?.section.id;
                if (
                    owner &&
                    owner !== sectionId &&
                    (owner !== "working" || !updates.has("working"))
                ) {
                    throw new ContributionFormatError(
                        "A completed entry must move from In progress in the same edit.",
                    );
                }
                if (entry.noteOrigins) {
                    const indices = Array.from(entry.noteOrigins).filter(
                        (index) => index !== null,
                    );
                    const sourceNoteCount =
                        origin?.record.entry.notes.length ?? 0;
                    if (
                        entry.noteOrigins.length !== entry.notes.length ||
                        new Set(indices).size !== indices.length ||
                        indices.some(
                            (index) =>
                                !Number.isInteger(index) ||
                                index < 0 ||
                                index >= sourceNoteCount,
                        )
                    ) {
                        throw new ContributionFormatError(
                            "The notes no longer match the source contribution record.",
                        );
                    }
                }
                if (
                    sectionId !== "working" &&
                    entry.status &&
                    (owner !== sectionId ||
                        entry.status !== origin?.record.entry.status) &&
                    !completedAssessmentCodes[sectionId].includes(entry.status)
                ) {
                    throw new ContributionFormatError(
                        "The assessment code is not used in this contribution section.",
                    );
                }
            }
        }

        const parts: string[] = [];
        const expectedSpans = new Map<ContributionSectionId, Span>();
        let offset = 0;
        let shift = 0;
        for (const section of original) {
            const entries = updates.get(section.id);
            let data = entries
                ? renderSection(section, entries, origins)
                : section.data;
            if (numberEntries) {
                data =
                    data === section.data
                        ? (numbered.get(section.id) ?? data)
                        : numberRecords(data, section.newline, section.id);
            }
            parts.push(source.slice(offset, section.span.start), data);
            const start = section.span.start + shift;
            expectedSpans.set(section.id, { start, end: start + data.length });
            shift += data.length - section.data.length;
            offset = section.span.end;
        }
        parts.push(source.slice(offset));
        const result = parts.join("");
        if (result === source) return source;

        const verified = readPage(result);
        if (
            verified.length !== original.length ||
            verified.some((section) => {
                const span = expectedSpans.get(section.id);
                const before = original.find(({ id }) => id === section.id);
                const entries =
                    updates.get(section.id) ??
                    before?.records.map(({ entry }) => entry);
                return (
                    !span ||
                    span.start !== section.span.start ||
                    span.end !== section.span.end ||
                    !entries ||
                    entries.length !== section.records.length ||
                    entries.some(
                        (entry, index) =>
                            !sameValues(
                                entry,
                                section.records[index].entry,
                                true,
                            ),
                    )
                );
            })
        ) {
            throw new ContributionFormatError(
                "The edits change the contribution template or record structure.",
            );
        }
        return result;
    }

    return { sections, numberingNeeded, withSections };
}
