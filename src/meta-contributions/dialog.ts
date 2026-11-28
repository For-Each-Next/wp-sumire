import { wikiInterfaceLocale } from "../shared/wiki-locale.ts";
import { getActionMessages } from "./action-messages.ts";
import { completedAssessmentCodes } from "./assessment.ts";
import { completionDestination, moveCompletedEntry } from "./completion.ts";
import {
    type CompletedSectionId,
    type ContributionEntry,
    type ContributionSection,
    type ContributionSectionId,
} from "./contributions.ts";
import {
    assessmentLabels,
    contributionDialogMessages,
} from "./dialog-messages.ts";
import { contributionDialogStyles } from "./dialog-style.ts";
import { MAX_EDIT_SUMMARY_LENGTH } from "./edit-summary.ts";
import {
    profileItemSource,
    PROFILE_OWNER,
    type MetaProfile,
    type ProfileEdits,
    type ProfileItem,
} from "./meta-api.ts";
import { formatEntryName, formatPageTitle } from "./page-title.ts";
import { parsePrefillLink } from "./prefill-link.ts";
import { prefillContribution, type ContributionPrefill } from "./prefill.ts";
import {
    prepareItemPreviewDocument,
    preparePreviewDocument,
} from "./preview.ts";
import {
    profileRecordFields,
    profileRecordSectionIds,
    requiredProfileFields,
    type ProfileRecord,
    type ProfileRecordField,
    type ProfileRecordSectionId,
    type ProfileSectionId,
} from "./profile-records.ts";
import { formatRecordNumber, recordNumber } from "./profile-wikitext.ts";
import {
    invalidTranslationField,
    parseTranslationNote,
    serializeTranslationNote,
    type TranslationField,
    type TranslationNote,
} from "./translation-note.ts";

type Ref<T> = { value: T };
type VNode = unknown;
type CreateApp = (component: { setup: () => () => VNode }) => {
    mount: (element: HTMLElement) => unknown;
    unmount: () => void;
};
type VueRuntime = {
    h: (
        type: string | object,
        props: Record<string, unknown> | null,
        children?: unknown,
    ) => VNode;
    ref: <T>(value: T) => Ref<T>;
    computed: <T>(getter: () => T) => Readonly<Ref<T>>;
    watch: <T>(
        getter: () => T,
        callback: (
            value: T,
            previous: T | undefined,
            onCleanup: (cleanup: () => void) => void,
        ) => void,
    ) => void;
    nextTick: () => Promise<void>;
    createApp: CreateApp;
    createMwApp?: CreateApp;
};
type CodexRuntime = Record<
    | "CdxDialog"
    | "CdxTabs"
    | "CdxTab"
    | "CdxButton"
    | "CdxField"
    | "CdxTextInput"
    | "CdxTextArea"
    | "CdxMessage"
    | "CdxRadio"
    | "CdxCombobox"
    | "CdxAccordion",
    object
>;

type DialogOptions = {
    loader: {
        using: (names: string[]) => PromiseLike<(name: string) => unknown>;
    };
    document: Document;
    language: unknown;
    variant: unknown;
    editor: MetaProfile;
    metaPageUrl: string;
};

type EntryField = Exclude<
    keyof ContributionEntry,
    "id" | "notes" | "noteOrigins"
>;
type NoteKind = "translation" | "text";
type EditorNote = {
    id: number;
    origin: number | null;
    kind: NoteKind;
    translation: TranslationNote;
    text: string | null;
};
type EditorEntry = ContributionEntry<EditorNote>;
type EditorSection = ContributionSection<EditorNote>;
type FieldOptions = {
    class?: string;
    optional?: boolean;
    error?: string;
    isFieldset?: boolean;
};
type PendingPreview = {
    edits: ProfileEdits;
    html: string;
    suggestedSummary: string;
    returnFocus: string;
};
type ItemPreview = { source?: string } & (
    | { state: "empty" | "loading" }
    | { state: "ready"; html: string }
    | { state: "error"; message: string }
);
type InvalidRecord = { section: ProfileRecordSectionId; entry: ProfileRecord };

const profileTabIds: readonly ProfileSectionId[] = [
    "contributions",
    "barnstars",
    "quotations",
    "userboxes",
];
const classMarks = new Map([
    ["bplus", "B+"],
    ["start", "D"],
    ["list", "L"],
    ["stub", "E"],
    ["sl", "EL"],
    ["???", "?"],
]);
const entryChipClass = "cdx-info-chip cdx-info-chip--subtle contrib-chip";
type InvalidEntry = { section: EditorSection; entry: EditorEntry } & (
    { field: "title" | "type" } | { field: TranslationField; note: EditorNote }
);

function readEditorSections(
    sections: readonly ContributionSection[],
    readNote: (source: string, index: number) => EditorNote,
): EditorSection[] {
    return sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
            ...entry,
            notes: entry.notes.map(readNote),
        })),
    }));
}

function customNoteText(note: EditorNote): string {
    if (note.text !== null) return note.text;
    return invalidTranslationField(note.translation)
        ? ""
        : serializeTranslationNote(note.translation);
}

function serializeEditorSections(
    sections: readonly EditorSection[],
): ContributionSection[] {
    return sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
            ...entry,
            notes: entry.notes.map((note) =>
                note.kind === "translation"
                    ? serializeTranslationNote(note.translation)
                    : customNoteText(note),
            ),
            noteOrigins: entry.notes.map((note) => note.origin),
        })),
    }));
}

function findInvalidEntry(
    sections: readonly EditorSection[],
): InvalidEntry | null {
    for (const section of sections) {
        for (const entry of section.entries) {
            if (!entry.title.trim()) return { section, entry, field: "title" };
            if (section.id === "working" && !entry.type.trim())
                return { section, entry, field: "type" };
            for (const note of entry.notes) {
                const field =
                    note.kind === "translation"
                        ? invalidTranslationField(note.translation)
                        : null;
                if (field) return { section, entry, field, note };
            }
        }
    }
    return null;
}

function formatTitleInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    const formatted = formatPageTitle(input.value);
    if (input.value === formatted) return;
    const { selectionStart, selectionEnd } = input;
    input.value = formatted;
    input.setSelectionRange(selectionStart, selectionEnd);
}

export async function openProfileDialog({
    loader,
    document,
    language,
    variant,
    editor,
    metaPageUrl,
}: DialogOptions): Promise<void> {
    const require = await loader.using(["vue", "@wikimedia/codex"]);
    const { h, ref, computed, watch, nextTick, createApp, createMwApp } =
        require("vue") as VueRuntime;
    const {
        CdxDialog,
        CdxTabs,
        CdxTab,
        CdxButton,
        CdxField,
        CdxTextInput,
        CdxTextArea,
        CdxMessage,
        CdxRadio,
        CdxCombobox,
        CdxAccordion,
    } = require("@wikimedia/codex") as CodexRuntime;

    const locale = wikiInterfaceLocale(language, variant);
    const messages = contributionDialogMessages[locale];
    const monthFormatter = new Intl.DateTimeFormat(locale, {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
    const { contributions, barnstars, quotations, userboxes } = editor;
    const recordSections = { barnstars, quotations, userboxes };
    const firstTab = profileTabIds.find((id) =>
        id === "contributions" ? contributions : recordSections[id],
    );
    const translationErrors: Record<TranslationField, string> = {
        site: messages.translationSiteError,
        title: messages.translationTitleError,
        authors: messages.translationAuthorsError,
    };
    const noteKinds = [
        { value: "translation", label: messages.translationNote },
        { value: "text", label: messages.customText },
    ] as const;
    const activities = Object.entries(messages.activities).map(
        ([value, label]) => ({ value, label }),
    );
    const activityLabels = new Map(
        activities.map(({ value, label }) => [value, label]),
    );
    const statusLabels = assessmentLabels(messages);
    const statusOption = (value: string) => {
        const label = statusLabels.get(value) ?? value;
        return { value, text: `${label} (${value})` };
    };
    const statusOptions = {
        articles: completedAssessmentCodes.articles.map(statusOption),
        reviews: completedAssessmentCodes.reviews.map(statusOption),
    };

    const open = ref(false);
    let finish = () => {};
    const closed = new Promise<void>((resolve) => {
        finish = resolve;
    });
    const app = (createMwApp ?? createApp)({
        setup() {
            let noteSerial = 0;
            function createNote(source?: string, index?: number): EditorNote {
                const translation =
                    source === undefined ? null : parseTranslationNote(source);
                return {
                    id: ++noteSerial,
                    origin: index ?? null,
                    kind:
                        translation || source === undefined
                            ? "translation"
                            : "text",
                    translation: translation ?? {
                        site: "",
                        title: "",
                        authors: "",
                        partly: false,
                    },
                    text: translation ? null : (source ?? null),
                };
            }

            const draft = ref(
                readEditorSections(contributions?.sections ?? [], createNote),
            );
            const initial = JSON.stringify(draft.value);
            const copyRecords = (entries: readonly ProfileRecord[] = []) =>
                entries.map(({ id, fields }) => ({
                    id,
                    fields: { ...fields },
                }));
            const records = ref({
                barnstars: copyRecords(barnstars?.entries),
                quotations: copyRecords(quotations?.entries),
                userboxes: copyRecords(userboxes?.entries),
            });
            const initialRecords = {
                barnstars: JSON.stringify(records.value.barnstars),
                quotations: JSON.stringify(records.value.quotations),
                userboxes: JSON.stringify(records.value.userboxes),
            };
            const contributionsDirty = computed(
                () => JSON.stringify(draft.value) !== initial,
            );
            const changedRecordSections = computed(() =>
                profileRecordSectionIds.filter(
                    (id) =>
                        JSON.stringify(records.value[id]) !==
                        initialRecords[id],
                ),
            );
            const dirty = computed(
                () =>
                    contributionsDirty.value ||
                    changedRecordSections.value.length > 0,
            );
            const activeTab = ref<ProfileSectionId>(
                firstTab ?? "contributions",
            );
            const includeContributions = computed(
                () =>
                    contributionsDirty.value ||
                    (contributions?.needsNumbering === true &&
                        activeTab.value === "contributions" &&
                        !changedRecordSections.value.length),
            );
            const recordSectionsToReview = computed(() => {
                const tab = activeTab.value;
                return !dirty.value &&
                    tab !== "contributions" &&
                    recordSections[tab]?.needsNumbering
                    ? [tab]
                    : changedRecordSections.value;
            });
            const summaryOverride = ref<string | null>(null);
            const activeSection = ref<ContributionSectionId | null>(
                draft.value[0]?.id ?? null,
            );
            const selectedIds = ref<
                Partial<
                    Record<
                        ContributionSectionId | ProfileRecordSectionId,
                        string
                    >
                >
            >({});
            const search = ref("");
            const choiceQuery = ref<string | null>(null);
            const choiceFilter = ref("");
            const removing = ref<string | null>(null);
            const invalid = ref<InvalidEntry | null>(null);
            const invalidRecord = ref<InvalidRecord | null>(null);
            const discarding = ref(false);
            const saving = ref(false);
            const previewing = ref(false);
            const prefilling = ref(false);
            const busy = computed(
                () => saving.value || previewing.value || prefilling.value,
            );
            const pendingPreview = ref<PendingPreview | null>(null);
            const canPreview = computed(
                () =>
                    !busy.value &&
                    !pendingPreview.value &&
                    removing.value === null &&
                    (includeContributions.value ||
                        recordSectionsToReview.value.length > 0),
            );
            const itemPreview = ref<ItemPreview>({ state: "empty" });
            const requestError = ref("");
            const savedRevision = ref<string | null>(null);
            let entrySerial = 0;
            let filterTimer: ReturnType<typeof setTimeout> | undefined;

            watch(selectedPreviewItem, (item, _previous, onCleanup) => {
                if (!item) {
                    itemPreview.value = { state: "empty" };
                    return;
                }
                let source: string;
                try {
                    source = profileItemSource(item);
                } catch {
                    itemPreview.value = {
                        state: "error",
                        message: getActionMessages(language, variant)
                            .invalidFields,
                    };
                    return;
                }
                itemPreview.value = { state: "loading", source };
                let stale = false;
                const timer = setTimeout(async () => {
                    try {
                        const html = await editor.previewItem(source);
                        if (!stale)
                            itemPreview.value = {
                                state: "ready",
                                source,
                                html: prepareItemPreviewDocument(
                                    document,
                                    html,
                                ),
                            };
                    } catch (error) {
                        const message =
                            error instanceof Error && error.message
                                ? error.message
                                : messages.itemPreviewFailed;
                        if (!stale)
                            itemPreview.value = {
                                state: "error",
                                source,
                                message,
                            };
                    }
                }, 400);
                onCleanup(() => {
                    stale = true;
                    clearTimeout(timer);
                });
            });

            function setChoiceQuery(query: string | null) {
                clearTimeout(filterTimer);
                choiceQuery.value = query;
                if (query === null) {
                    choiceFilter.value = "";
                    return;
                }
                // Let Codex finish scrolling its highlighted item before replacing the list.
                filterTimer = setTimeout(() => {
                    choiceFilter.value = query.trim().toLocaleLowerCase();
                }, 80);
            }

            function close() {
                clearTimeout(filterTimer);
                open.value = false;
                finish();
            }

            function requestEditorClose() {
                if (busy.value) return;
                if (discarding.value) discarding.value = false;
                else if (!dirty.value) close();
                else discarding.value = true;
            }

            function requestPreviewClose() {
                if (saving.value) return;
                if (savedRevision.value !== null) {
                    close();
                    return;
                }
                const proposed = pendingPreview.value;
                if (!proposed) return;
                pendingPreview.value = null;
                requestError.value = "";
                document.defaultView?.requestAnimationFrame(() =>
                    focusField(proposed.returnFocus),
                );
            }

            function focusField(
                selector: string,
                dialog: "editor" | "preview" = "editor",
            ) {
                void nextTick().then(() => {
                    document
                        .querySelector<HTMLElement>(
                            `.sumire-contrib--${dialog} ${selector}`,
                        )
                        ?.focus();
                });
            }

            function focusNote(note: EditorNote) {
                focusField(
                    `.contrib-note-row[data-note-id="${note.id}"] input[type="radio"]:checked`,
                );
            }

            function resetNavigation() {
                search.value = "";
                setChoiceQuery(null);
                removing.value = null;
            }

            function selectTab(id: ProfileSectionId) {
                activeTab.value = id;
                resetNavigation();
            }

            function selectSection(id: ContributionSectionId | null) {
                if (id === activeSection.value) return;
                activeSection.value = id;
                resetNavigation();
            }

            function selectEntry(section: EditorSection, entry: EditorEntry) {
                selectedIds.value[section.id] = entry.id;
                setChoiceQuery(null);
                removing.value = null;
            }

            function selectedEntry<T extends { id: string }>(
                section: ContributionSectionId | ProfileRecordSectionId,
                entries: readonly T[],
            ): T | undefined {
                return (
                    entries.find(
                        ({ id }) => id === selectedIds.value[section],
                    ) ?? entries[0]
                );
            }

            function selectedPreviewItem(): ProfileItem | null {
                if (
                    !open.value ||
                    discarding.value ||
                    previewing.value ||
                    pendingPreview.value
                )
                    return null;
                const section = activeTab.value;
                if (section === "contributions") {
                    const group = draft.value.find(
                        ({ id }) => id === activeSection.value,
                    );
                    if (!group) return null;
                    const entry = selectedEntry(group.id, group.entries);
                    if (!entry) return null;
                    const selected = [{ ...group, entries: [entry] }];
                    if (findInvalidEntry(selected)) return null;
                    const [serialized] = serializeEditorSections(selected);
                    return {
                        section,
                        group: group.id,
                        defaultSite: group.defaultSite,
                        entry: serialized.entries[0],
                        number: recordNumber(
                            group.id,
                            group.entries.indexOf(entry),
                            group.entries.length,
                        ),
                    };
                }
                const data = recordSections[section];
                const entries = records.value[section];
                const entry = selectedEntry(section, entries);
                if (!data || !entry || !hasRecordContent(section, entry))
                    return null;
                return {
                    section,
                    defaultSite: data.defaultSite,
                    entry: { id: entry.id, fields: { ...entry.fields } },
                    number: recordNumber(
                        section,
                        entries.indexOf(entry),
                        entries.length,
                    ),
                };
            }

            async function addEntry(section: EditorSection) {
                if (busy.value) return;
                requestError.value = "";
                const input = search.value.trim();
                const link = input
                    ? parsePrefillLink(input, section.defaultSite)
                    : null;
                if (input && !link) {
                    requestError.value = messages.prefillInvalid;
                    focusField(".contrib-request-error");
                    return;
                }

                let prefilled: ContributionPrefill | undefined;
                if (link) {
                    prefilling.value = true;
                    try {
                        prefilled = await prefillContribution(
                            section.id,
                            link,
                            PROFILE_OWNER,
                        );
                    } finally {
                        prefilling.value = false;
                    }
                }
                const entry: EditorEntry = {
                    id: "new-contribution-" + ++entrySerial,
                    title: "",
                    label: "",
                    site: "",
                    status: "",
                    date: "",
                    type: section.id === "working" ? "draft" : "",
                    draft: "",
                    talk: "",
                    notes: [],
                    ...prefilled,
                };
                if (entry.site === section.defaultSite) entry.site = "";
                section.entries.unshift(entry);
                search.value = "";
                selectEntry(section, entry);
                if (prefilled && section.id === "working" && !entry.type)
                    invalid.value = { section, entry, field: "type" };
                focusField(".contrib-entry-title input");
            }

            function removeEntry<T extends { id: string }>(
                section: ContributionSectionId | ProfileRecordSectionId,
                entries: T[],
                entry: T,
            ) {
                const index = entries.indexOf(entry);
                if (index < 0) return;
                entries.splice(index, 1);
                const next = entries[index] ?? entries[index - 1];
                selectedIds.value[section] = next?.id;
                setChoiceQuery(null);
                removing.value = null;
                focusField(".contrib-list-controls .cdx-button");
            }

            function completeEntry(
                entry: EditorEntry,
                destination: CompletedSectionId,
            ) {
                const completed = moveCompletedEntry(
                    draft.value,
                    entry.id,
                    destination,
                );
                if (!completed) return;
                selectSection(destination);
                selectedIds.value[destination] = completed.id;
                focusField(".contrib-entry-title input");
            }

            function validatedSections(): ContributionSection[] | null {
                invalid.value = findInvalidEntry(draft.value);
                const issue = invalid.value;
                if (!issue) return serializeEditorSections(draft.value);
                selectTab("contributions");
                selectSection(issue.section.id);
                selectEntry(issue.section, issue.entry);
                if ("note" in issue) {
                    focusField(
                        `.contrib-note-row[data-note-id="${issue.note.id}"] .contrib-translation-${issue.field} :is(input, textarea)`,
                    );
                } else {
                    focusField(
                        issue.field === "title"
                            ? ".contrib-entry-title input"
                            : '.contrib-entry-type input[type="radio"]',
                    );
                }
                return null;
            }

            function hasRecordContent(
                section: ProfileRecordSectionId,
                entry: ProfileRecord,
            ): boolean {
                return requiredProfileFields[section].some((key) =>
                    Boolean(entry.fields[key]?.trim()),
                );
            }

            function requiresRecordContent(
                section: ProfileRecordSectionId,
                entry: ProfileRecord,
            ): boolean {
                const original = recordSections[section]?.entries.find(
                    ({ id }) => id === entry.id,
                );
                return !original || hasRecordContent(section, original);
            }

            function validatedEdits(): ProfileEdits | null {
                const edits: ProfileEdits = {};
                if (includeContributions.value) {
                    const sections = validatedSections();
                    if (!sections) return null;
                    edits.contributions = sections;
                }
                invalidRecord.value = null;
                for (const section of recordSectionsToReview.value) {
                    const entries = records.value[section];
                    const [key] = requiredProfileFields[section];
                    const entry = entries.find(
                        (record) =>
                            requiresRecordContent(section, record) &&
                            !hasRecordContent(section, record),
                    );
                    if (entry) {
                        invalidRecord.value = { section, entry };
                        selectTab(section);
                        selectedIds.value[section] = entry.id;
                        focusField(
                            `.contrib-record-${key} :is(input, textarea)`,
                        );
                        return null;
                    }
                    edits[section] = copyRecords(entries);
                }
                return edits;
            }

            async function submit() {
                const proposed = pendingPreview.value;
                if (busy.value || !proposed || savedRevision.value !== null)
                    return;
                requestError.value = "";
                saving.value = true;
                try {
                    savedRevision.value = await editor.save(
                        proposed.edits,
                        summaryOverride.value ?? proposed.suggestedSummary,
                    );
                    focusField(".contrib-done-button", "preview");
                } catch (error) {
                    requestError.value =
                        error instanceof Error && error.message
                            ? error.message
                            : messages.saveFailed;
                    focusField(".contrib-request-error", "preview");
                } finally {
                    saving.value = false;
                }
            }

            async function showPreview(returnFocus: string) {
                if (!canPreview.value) return;
                try {
                    requestError.value = "";
                    const edits = validatedEdits();
                    if (!edits) return;
                    previewing.value = true;
                    const proposed = await editor.preview(edits);
                    const html = preparePreviewDocument(
                        document,
                        proposed.html,
                        proposed.sections,
                    );
                    pendingPreview.value = {
                        edits,
                        html,
                        suggestedSummary: proposed.suggestedSummary,
                        returnFocus,
                    };
                } catch (error) {
                    requestError.value =
                        error instanceof Error && error.message
                            ? error.message
                            : messages.previewFailed;
                    focusField(".contrib-request-error");
                } finally {
                    previewing.value = false;
                }
            }

            function button(
                label: string,
                onClick: () => void,
                props: Record<string, unknown> = {},
            ) {
                return h(
                    CdxButton,
                    { disabled: busy.value, onClick, ...props },
                    { default: () => label },
                );
            }

            function field(
                label: string,
                control: VNode,
                options: FieldOptions = {},
            ) {
                return h(
                    CdxField,
                    {
                        class: options.class,
                        disabled: busy.value,
                        isFieldset: options.isFieldset,
                        optional: options.optional,
                        optionalFlag: options.optional
                            ? messages.optional
                            : undefined,
                        status: options.error ? "error" : "default",
                        messages: options.error
                            ? { error: options.error }
                            : undefined,
                    },
                    {
                        label: () => label,
                        default: () => control,
                    },
                );
            }

            function fieldError(entry: EditorEntry, key: "title" | "type") {
                const issue = invalid.value;
                if (
                    !issue ||
                    "note" in issue ||
                    issue.entry.id !== entry.id ||
                    issue.field !== key ||
                    entry[key].trim()
                )
                    return;
                return key === "title"
                    ? messages.titleRequired
                    : messages.typeRequired;
            }

            function textField(
                entry: EditorEntry,
                key: EntryField,
                label: string,
                options: FieldOptions = {},
                placeholder?: string,
            ) {
                const pageTitle =
                    key === "title" || key === "draft" || key === "talk";
                return field(
                    label,
                    h(CdxTextInput, {
                        modelValue: pageTitle
                            ? formatPageTitle(entry[key])
                            : entry[key],
                        "onUpdate:modelValue": (value: string) => {
                            entry[key] = pageTitle
                                ? formatPageTitle(value)
                                : value;
                        },
                        onInput: pageTitle ? formatTitleInput : undefined,
                        placeholder,
                        required: key === "title" || undefined,
                        "aria-invalid": options.error ? true : undefined,
                    }),
                    options,
                );
            }

            function activityField(entry: EditorEntry) {
                const current = entry.type;
                const options =
                    current &&
                    !activities.some(({ value }) => value === current)
                        ? [...activities, { value: current, label: current }]
                        : activities;
                const error = fieldError(entry, "type");
                return field(
                    messages.type,
                    options.map(({ value, label }) =>
                        h(
                            CdxRadio,
                            {
                                key: value,
                                name: "sumire-contrib-type",
                                inputValue: value,
                                modelValue: current,
                                inline: true,
                                required: true,
                                "aria-invalid": error ? true : undefined,
                                "onUpdate:modelValue": (value: string) => {
                                    entry.type = value;
                                },
                            },
                            { default: () => label },
                        ),
                    ),
                    { class: "contrib-entry-type", isFieldset: true, error },
                );
            }

            function assessmentField(
                entry: EditorEntry,
                section: CompletedSectionId,
            ) {
                const options = statusOptions[section];
                const choices = [
                    { value: "", text: messages.noStatus },
                    ...options,
                ];
                const query = choiceFilter.value;
                return field(
                    messages.status,
                    h(
                        CdxCombobox,
                        {
                            selected:
                                choiceQuery.value ??
                                options.find(
                                    ({ value }) => value === entry.status,
                                )?.text ??
                                "",
                            menuItems: choices
                                .filter(
                                    ({ text }) =>
                                        !query ||
                                        text
                                            .toLocaleLowerCase()
                                            .includes(query),
                                )
                                .map(({ text }) => ({
                                    value: text,
                                    label: text,
                                })),
                            menuConfig: { visibleItemLimit: 6 },
                            placeholder: messages.noStatus,
                            "aria-label": messages.status,
                            onInput: (event: Event) => {
                                const input =
                                    event.target as HTMLInputElement | null;
                                // Reopen a closed menu when typing after a selection.
                                if (
                                    input?.getAttribute("aria-expanded") ===
                                    "false"
                                ) {
                                    input.dispatchEvent(
                                        new KeyboardEvent("keydown", {
                                            key: "ArrowDown",
                                            cancelable: true,
                                        }),
                                    );
                                }
                            },
                            "onUpdate:selected": (
                                selection: string | number,
                            ) => {
                                const option = choices.find(
                                    ({ text }) => text === selection,
                                );
                                if (option) entry.status = option.value;
                                setChoiceQuery(
                                    option ? null : String(selection),
                                );
                            },
                            onBlur: () => setChoiceQuery(null),
                        },
                        { "no-results": () => messages.noChoices },
                    ),
                    { optional: true },
                );
            }

            function renderTranslationNote(note: EditorNote): VNode[] {
                const translation = note.translation;
                const issue = invalid.value;
                const invalidField =
                    issue && "note" in issue && issue.note.id === note.id
                        ? invalidTranslationField(translation)
                        : null;
                const fieldOptions = (
                    key: TranslationField,
                ): FieldOptions => ({
                    class: `contrib-translation-${key}`,
                    optional: key === "authors",
                    error:
                        key === invalidField
                            ? translationErrors[key]
                            : undefined,
                });
                return [
                    field(
                        messages.translationSite,
                        h(CdxTextInput, {
                            modelValue: translation.site,
                            "onUpdate:modelValue": (value: string) => {
                                translation.site = value;
                            },
                            placeholder: "en",
                            required: true,
                        }),
                        fieldOptions("site"),
                    ),
                    field(
                        messages.translationPage,
                        h(CdxTextInput, {
                            modelValue: formatPageTitle(translation.title),
                            "onUpdate:modelValue": (value: string) => {
                                translation.title = formatPageTitle(value);
                            },
                            onInput: formatTitleInput,
                            required: true,
                        }),
                        fieldOptions("title"),
                    ),
                    field(
                        messages.translationAuthors,
                        h(CdxTextArea, {
                            modelValue: translation.authors,
                            rows: 1,
                            "onUpdate:modelValue": (value: string) => {
                                translation.authors = value;
                            },
                            placeholder: messages.translationAuthorsHint,
                        }),
                        fieldOptions("authors"),
                    ),
                ];
            }

            function moveNote(
                entry: EditorEntry,
                index: number,
                offset: -1 | 1,
            ) {
                const target = index + offset;
                const note = entry.notes[index];
                const neighbor = entry.notes[target];
                if (!note || !neighbor) return;
                entry.notes[index] = neighbor;
                entry.notes[target] = note;
                focusNote(note);
            }

            function removeNote(entry: EditorEntry, index: number) {
                entry.notes.splice(index, 1);
                const next = entry.notes[index] ?? entry.notes[index - 1];
                if (next) focusNote(next);
                else focusField(".contrib-add-note-button");
            }

            function renderNote(
                entry: EditorEntry,
                note: EditorNote,
                index: number,
            ) {
                return h(
                    "fieldset",
                    {
                        class: "contrib-fieldset contrib-note-row",
                        key: note.id,
                        "data-note-id": note.id,
                    },
                    [
                        h(
                            "legend",
                            null,
                            messages.note.replace("$1", String(index + 1)),
                        ),
                        h("div", { class: "contrib-fields" }, [
                            h(
                                "div",
                                {
                                    role: "radiogroup",
                                    "aria-label": messages.noteKind,
                                },
                                noteKinds.map(({ value, label }) =>
                                    h(
                                        CdxRadio,
                                        {
                                            key: value,
                                            name: `sumire-contrib-note-${note.id}`,
                                            inputValue: value,
                                            modelValue: note.kind,
                                            disabled: busy.value,
                                            "onUpdate:modelValue": (
                                                kind: NoteKind,
                                            ) => {
                                                note.kind = kind;
                                            },
                                        },
                                        { default: () => label },
                                    ),
                                ),
                            ),
                            ...(note.kind === "translation"
                                ? renderTranslationNote(note)
                                : [
                                      h(CdxTextArea, {
                                          modelValue: customNoteText(note),
                                          rows: 2,
                                          disabled: busy.value,
                                          "aria-label": messages.customText,
                                          "onUpdate:modelValue": (
                                              value: string,
                                          ) => {
                                              note.text = value;
                                          },
                                      }),
                                  ]),
                            h("div", { class: "contrib-note-actions" }, [
                                button(
                                    messages.moveNoteUp,
                                    () => moveNote(entry, index, -1),
                                    {
                                        disabled: busy.value || index === 0,
                                    },
                                ),
                                button(
                                    messages.moveNoteDown,
                                    () => moveNote(entry, index, 1),
                                    {
                                        disabled:
                                            busy.value ||
                                            index === entry.notes.length - 1,
                                    },
                                ),
                                button(
                                    messages.deleteLabel,
                                    () => removeNote(entry, index),
                                    {
                                        weight: "quiet",
                                        action: "destructive",
                                        "aria-label":
                                            messages.removeNote.replace(
                                                "$1",
                                                String(index + 1),
                                            ),
                                    },
                                ),
                            ]),
                        ]),
                    ],
                );
            }

            function renderNotes(entry: EditorEntry) {
                return h(
                    "section",
                    { class: "contrib-notes", "aria-label": messages.notes },
                    [
                        ...entry.notes.map((note, index) =>
                            renderNote(entry, note, index),
                        ),
                        button(
                            messages.addNote,
                            () => {
                                const note = createNote();
                                entry.notes.push(note);
                                focusNote(note);
                            },
                            { class: "contrib-add-note-button" },
                        ),
                    ],
                );
            }

            function editorSaveButton() {
                return button(
                    messages.saveEntry,
                    () => {
                        void showPreview(".contrib-save-button");
                    },
                    {
                        class: "contrib-save-button",
                        title: messages.previewTitle,
                        action: "progressive",
                        weight: "primary",
                        disabled: !canPreview.value,
                    },
                );
            }

            function renderEditSummary(proposed: PendingPreview) {
                return field(
                    messages.editSummary,
                    h(CdxTextArea, {
                        modelValue:
                            summaryOverride.value ?? proposed.suggestedSummary,
                        "onUpdate:modelValue": (value: string) => {
                            summaryOverride.value = value;
                        },
                        placeholder: proposed.suggestedSummary,
                        rows: 2,
                        maxlength: MAX_EDIT_SUMMARY_LENGTH,
                        dir: "ltr",
                        lang: "en",
                    }),
                    { class: "contrib-edit-summary" },
                );
            }

            function renderItemPreview() {
                const preview = itemPreview.value;
                const content =
                    preview.state === "ready"
                        ? h("iframe", {
                              class: "contrib-item-preview-frame",
                              title: messages.itemPreview,
                              sandbox: "",
                              srcdoc: preview.html,
                          })
                        : h(
                              "p",
                              {
                                  class: "contrib-item-preview-status",
                                  role: "status",
                              },
                              preview.state === "error"
                                  ? preview.message
                                  : preview.state === "loading"
                                    ? messages.itemPreviewLoading
                                    : messages.itemPreviewEmpty,
                          );
                return h(
                    "section",
                    {
                        class: "contrib-item-preview",
                        "aria-labelledby": "contrib-item-preview-title",
                    },
                    [
                        h(
                            "p",
                            {
                                class: "contrib-item-preview-title",
                                id: "contrib-item-preview-title",
                            },
                            messages.itemPreview,
                        ),
                        h("div", { class: "contrib-item-preview-body" }, [
                            content,
                        ]),
                        preview.source
                            ? h(
                                  "div",
                                  { class: "contrib-item-preview-source" },
                                  [
                                      h(
                                          "p",
                                          {
                                              id: "contrib-item-preview-source-label",
                                          },
                                          messages.itemPreviewSource,
                                      ),
                                      h(
                                          "pre",
                                          {
                                              tabindex: 0,
                                              dir: "ltr",
                                              "aria-labelledby":
                                                  "contrib-item-preview-source-label",
                                          },
                                          preview.source,
                                      ),
                                  ],
                              )
                            : null,
                    ],
                );
            }

            function renderEntryActions(
                id: string,
                remove: () => void,
                extra?: VNode,
            ) {
                const actions =
                    removing.value === id
                        ? [
                              h(
                                  CdxMessage,
                                  { type: "warning" },
                                  {
                                      default: () =>
                                          messages.removeEntryPrompt,
                                  },
                              ),
                              button(
                                  messages.cancel,
                                  () => {
                                      removing.value = null;
                                  },
                                  { weight: "quiet" },
                              ),
                              button(messages.deleteLabel, remove, {
                                  action: "destructive",
                                  weight: "primary",
                              }),
                          ]
                        : [
                              button(
                                  messages.deleteLabel,
                                  () => {
                                      removing.value = id;
                                  },
                                  { action: "destructive", weight: "quiet" },
                              ),
                              editorSaveButton(),
                              extra,
                          ];
                return h("div", { class: "contrib-entry-actions" }, actions);
            }

            function renderEntry(section: EditorSection, entry: EditorEntry) {
                const destination =
                    section.id === "working"
                        ? completionDestination(entry.type)
                        : null;
                const canMove =
                    destination !== null &&
                    draft.value.some(({ id }) => id === destination);
                const details =
                    section.id === "working"
                        ? [
                              activityField(entry),
                              destination === "articles"
                                  ? textField(entry, "draft", messages.draft, {
                                        optional: true,
                                    })
                                  : null,
                              destination === "reviews"
                                  ? textField(entry, "talk", messages.talk, {
                                        optional: true,
                                    })
                                  : null,
                          ]
                        : [
                              assessmentField(entry, section.id),
                              textField(
                                  entry,
                                  "date",
                                  messages.date,
                                  { optional: true },
                                  "YYYY-MM",
                              ),
                          ];
                const move = canMove
                    ? button(
                          destination === "articles"
                              ? messages.moveToArticles
                              : messages.moveToReviews,
                          () => completeEntry(entry, destination),
                          { disabled: busy.value || !entry.title.trim() },
                      )
                    : null;
                return h("div", { class: "contrib-editor", key: entry.id }, [
                    h("fieldset", { class: "contrib-fieldset" }, [
                        h("legend", null, messages.basicInfo),
                        h("div", { class: "contrib-fields" }, [
                            textField(
                                entry,
                                "site",
                                messages.wiki,
                                { optional: true },
                                section.defaultSite,
                            ),
                            textField(entry, "title", messages.entryTitle, {
                                class: "contrib-entry-title",
                                error: fieldError(entry, "title"),
                            }),
                            textField(
                                entry,
                                "label",
                                messages.label,
                                { optional: true },
                                formatEntryName(entry.title),
                            ),
                            ...details,
                        ]),
                    ]),
                    renderNotes(entry),
                    renderItemPreview(),
                    renderEntryActions(
                        entry.id,
                        () => removeEntry(section.id, section.entries, entry),
                        move,
                    ),
                ]);
            }

            function dateChip(value: string): VNode {
                const date = value.trim();
                if (!date) return null;
                const month = /^(?!0000)\d{4}-(?:0[1-9]|1[0-2])$/u.test(date);
                const label = month
                    ? monthFormatter.format(new Date(date + "-01T00:00:00Z"))
                    : date;
                return h(
                    "span",
                    { class: entryChipClass },
                    h(
                        month ? "time" : "span",
                        {
                            class: "cdx-info-chip__text",
                            datetime: month ? date : undefined,
                        },
                        label,
                    ),
                );
            }

            function contributionChips(
                section: EditorSection,
                entry: EditorEntry,
            ): VNode[] {
                const status = entry.status.trim().toLowerCase();
                const activity =
                    section.id === "working" && !status
                        ? entry.type.trim()
                        : "";
                const label = activity
                    ? (activityLabels.get(activity) ?? activity)
                    : (statusLabels.get(status) ?? status);
                const classCode = status.replace(/-rev$/u, "");
                const mark = activity
                    ? label
                    : statusLabels.has(status)
                      ? (classMarks.get(classCode) ?? classCode.toUpperCase())
                      : "?";
                const chip = label
                    ? h(
                          "span",
                          {
                              class: entryChipClass,
                              role: "img",
                              "aria-label": label,
                              title: label,
                          },
                          h("span", { class: "cdx-info-chip__text" }, mark),
                      )
                    : null;
                return [chip, dateChip(entry.date)];
            }

            function renderList<T extends { id: string }>(
                section: ContributionSectionId | ProfileRecordSectionId,
                entries: T[],
                selected: T | undefined,
                matches: (entry: T) => boolean,
                select: (entry: T) => void,
                name: (entry: T) => string,
                chips: (entry: T) => VNode[],
            ) {
                const visible = entries
                    .map((entry, index) => ({ entry, index }))
                    .filter(({ entry }) => matches(entry));
                if (!visible.length) {
                    return h(
                        "p",
                        { class: "contrib-help" },
                        search.value.trim()
                            ? messages.noMatches
                            : messages.noEntries,
                    );
                }
                return h(
                    "ul",
                    { class: "contrib-list" },
                    visible.map(({ entry, index }) => {
                        const title = name(entry);
                        const number = formatRecordNumber(
                            recordNumber(section, index, entries.length),
                        );
                        const parts = title.split(
                            /(?<!')''(?!')(.+?)(?<!')''(?!')/gsu,
                        );
                        return h(
                            "li",
                            { key: entry.id },
                            h(
                                CdxButton,
                                {
                                    class: "contrib-entry-choice",
                                    weight: "quiet",
                                    disabled: busy.value,
                                    "aria-pressed": selected?.id === entry.id,
                                    onClick: () => select(entry),
                                },
                                {
                                    default: () => [
                                        h(
                                            "span",
                                            { class: "contrib-entry-number" },
                                            `${number} `,
                                        ),
                                        h(
                                            "span",
                                            {
                                                class: "contrib-entry-name",
                                                title: parts.join(""),
                                            },
                                            parts.map((part, index) =>
                                                index % 2 === 0
                                                    ? part
                                                    : h("i", null, part),
                                            ),
                                        ),
                                        ...chips(entry),
                                    ],
                                },
                            ),
                        );
                    }),
                );
            }

            function renderListControls(label: string, add: () => void) {
                return h("div", { class: "contrib-list-controls" }, [
                    h(CdxTextInput, {
                        inputType: "search",
                        disabled: busy.value,
                        modelValue: search.value,
                        "onUpdate:modelValue": (value: string) => {
                            search.value = value;
                        },
                        placeholder: messages.search,
                        "aria-label": messages.search,
                    }),
                    button(label, add, { action: "progressive" }),
                ]);
            }

            function renderEmptyEditor() {
                return h("div", { class: "contrib-editor" }, [
                    h("p", { class: "contrib-help" }, messages.selectEntry),
                    h("div", { class: "contrib-entry-actions" }, [
                        editorSaveButton(),
                    ]),
                ]);
            }

            function contributionName(entry: EditorEntry): string {
                return (
                    entry.label.trim() ||
                    formatEntryName(entry.title) ||
                    messages.untitled
                );
            }

            function renderContributionList(
                section: EditorSection,
                selected: EditorEntry | undefined,
            ) {
                const query = search.value.trim().toLocaleLowerCase();
                const matches = (entry: EditorEntry) =>
                    !query ||
                    [
                        contributionName(entry).replace(/'{2,}/gu, ""),
                        entry.title,
                        entry.label,
                        entry.site || section.defaultSite,
                    ].some((value) =>
                        value.toLocaleLowerCase().includes(query),
                    );
                return [
                    renderListControls(
                        prefilling.value
                            ? messages.prefilling
                            : messages.addEntry,
                        () => {
                            void addEntry(section);
                        },
                    ),
                    renderList(
                        section.id,
                        section.entries,
                        selected,
                        matches,
                        (entry) => selectEntry(section, entry),
                        contributionName,
                        (entry) => contributionChips(section, entry),
                    ),
                ];
            }

            function renderContributions() {
                const section = draft.value.find(
                    ({ id }) => id === activeSection.value,
                );
                const selected = section
                    ? selectedEntry(section.id, section.entries)
                    : undefined;
                return h("div", { class: "contrib-workspace" }, [
                    h(
                        "nav",
                        {
                            class: "contrib-navigation",
                            "aria-label": messages.contributions,
                        },
                        draft.value.map((group) =>
                            h(
                                CdxAccordion,
                                {
                                    key: group.id,
                                    modelValue: section?.id === group.id,
                                    onClick: (event: MouseEvent) => {
                                        const heading = (
                                            event.target as Element | null
                                        )?.closest("summary");
                                        if (
                                            heading?.parentElement !==
                                            event.currentTarget
                                        )
                                            return;
                                        event.preventDefault();
                                        if (!busy.value)
                                            selectSection(
                                                section?.id === group.id
                                                    ? null
                                                    : group.id,
                                            );
                                    },
                                },
                                {
                                    title: () => messages[group.id],
                                    default: () =>
                                        section?.id === group.id
                                            ? renderContributionList(
                                                  group,
                                                  selected,
                                              )
                                            : null,
                                },
                            ),
                        ),
                    ),
                    section && selected
                        ? renderEntry(section, selected)
                        : renderEmptyEditor(),
                ]);
            }

            function renderProfileRecords(
                section: ProfileRecordSectionId,
                defaultSite: string,
            ) {
                const entries = records.value[section];
                const selected = selectedEntry(section, entries);
                const required = requiredProfileFields[section];
                const [primaryField] = required;
                const name = ({ fields }: ProfileRecord) => {
                    const title =
                        section === "barnstars"
                            ? fields.label || fields.file
                            : section === "userboxes"
                              ? fields.badge || fields.text
                              : fields.text;
                    return (
                        title?.trim().replace(/\s+/gu, " ") ||
                        messages.untitled
                    );
                };
                const query = search.value.trim().toLocaleLowerCase();
                const matches = ({ fields }: ProfileRecord) =>
                    !query ||
                    Object.values(fields).some((value) =>
                        value.toLocaleLowerCase().includes(query),
                    );
                const addLabel = {
                    barnstars: messages.addBarnstar,
                    quotations: messages.addQuotation,
                    userboxes: messages.addUserbox,
                };
                const placeholders: Partial<
                    Record<ProfileRecordField, string>
                > = {
                    site: defaultSite,
                    date: "YYYY-MM",
                    color: "babel-2",
                };
                const add = () => {
                    const entry = {
                        id: "new-profile-record-" + ++entrySerial,
                        fields: {},
                    };
                    entries.unshift(entry);
                    selectedIds.value[section] = entry.id;
                    resetNavigation();
                    focusField(
                        `.contrib-record-${primaryField} :is(input, textarea)`,
                    );
                };
                return h("div", { class: "contrib-workspace" }, [
                    h(
                        "nav",
                        {
                            class: "contrib-navigation",
                            "aria-label": messages[section],
                        },
                        [
                            renderListControls(addLabel[section], add),
                            renderList(
                                section,
                                entries,
                                selected,
                                matches,
                                (entry) => {
                                    selectedIds.value[section] = entry.id;
                                    removing.value = null;
                                },
                                name,
                                ({ fields }) => [dateChip(fields.date ?? "")],
                            ),
                        ],
                    ),
                    selected
                        ? h(
                              "div",
                              { class: "contrib-editor", key: selected.id },
                              [
                                  h(
                                      "div",
                                      { class: "contrib-fields" },
                                      profileRecordFields[section].map(
                                          (key) => {
                                              const value =
                                                  selected.fields[key] ?? "";
                                              const requiredHere =
                                                  required.length === 1 &&
                                                  key === primaryField &&
                                                  requiresRecordContent(
                                                      section,
                                                      selected,
                                                  );
                                              const missing =
                                                  key === primaryField &&
                                                  !hasRecordContent(
                                                      section,
                                                      selected,
                                                  ) &&
                                                  invalidRecord.value
                                                      ?.section === section &&
                                                  invalidRecord.value.entry
                                                      .id === selected.id;
                                              const error = missing
                                                  ? {
                                                        barnstars:
                                                            messages.fileRequired,
                                                        quotations:
                                                            messages.quotationRequired,
                                                        userboxes:
                                                            messages.userboxRequired,
                                                    }[section]
                                                  : undefined;
                                              const highlight =
                                                  key === "text-find" ||
                                                  key === "trans-find";
                                              const multiline =
                                                  highlight ||
                                                  key === "text" ||
                                                  key === "trans" ||
                                                  key === "source" ||
                                                  key === "tip";
                                              const label =
                                                  section === "userboxes" &&
                                                  key === "text"
                                                      ? messages.userboxText
                                                      : messages.recordFields[
                                                            key
                                                        ];
                                              return field(
                                                  label,
                                                  h(
                                                      multiline
                                                          ? CdxTextArea
                                                          : CdxTextInput,
                                                      {
                                                          modelValue: highlight
                                                              ? value.replaceAll(
                                                                    "\\n",
                                                                    "\n",
                                                                )
                                                              : value,
                                                          "onUpdate:modelValue":
                                                              (
                                                                  value: string,
                                                              ) => {
                                                                  selected.fields[
                                                                      key
                                                                  ] = value;
                                                              },
                                                          rows: multiline
                                                              ? 2
                                                              : undefined,
                                                          placeholder:
                                                              placeholders[
                                                                  key
                                                              ],
                                                          required:
                                                              requiredHere,
                                                          "aria-invalid": error
                                                              ? true
                                                              : undefined,
                                                      },
                                                  ),
                                                  {
                                                      class: `contrib-record-${key}`,
                                                      optional: !requiredHere,
                                                      error,
                                                  },
                                              );
                                          },
                                      ),
                                  ),
                                  renderItemPreview(),
                                  renderEntryActions(selected.id, () =>
                                      removeEntry(section, entries, selected),
                                  ),
                              ],
                          )
                        : renderEmptyEditor(),
                ]);
            }

            function renderRequestError() {
                return requestError.value
                    ? h(
                          "div",
                          { class: "contrib-request-error", tabindex: -1 },
                          [
                              h(
                                  CdxMessage,
                                  { type: "error" },
                                  { default: () => requestError.value },
                              ),
                          ],
                      )
                    : null;
            }

            function renderTab(id: ProfileSectionId) {
                if (id === "contributions") {
                    if (contributions) return renderContributions();
                } else {
                    const records = recordSections[id];
                    if (records)
                        return renderProfileRecords(id, records.defaultSite);
                }
                return h(
                    CdxMessage,
                    { class: "contrib-unavailable", type: "warning" },
                    { default: () => messages.unavailable },
                );
            }

            function renderEditor() {
                return [
                    renderRequestError(),
                    h(
                        CdxTabs,
                        {
                            active: activeTab.value,
                            framed: false,
                            "onUpdate:active": selectTab,
                        },
                        {
                            default: () =>
                                profileTabIds.map((id) =>
                                    h(
                                        CdxTab,
                                        {
                                            key: id,
                                            name: id,
                                            label: messages[id],
                                            disabled: busy.value,
                                        },
                                        {
                                            default: () =>
                                                id === activeTab.value
                                                    ? renderTab(id)
                                                    : null,
                                        },
                                    ),
                                ),
                        },
                    ),
                ];
            }

            function link(href: string, label: string) {
                return h(
                    "a",
                    { href, target: "_blank", rel: "noopener noreferrer" },
                    label,
                );
            }

            function renderEditorFooter() {
                const confirming = discarding.value;
                const controls = confirming
                    ? [
                          button(messages.keepEditing, requestEditorClose),
                          button(messages.discard, close, {
                              action: "destructive",
                              weight: "primary",
                          }),
                      ]
                    : [
                          button(messages.cancel, requestEditorClose, {
                              action: "destructive",
                              weight: "quiet",
                          }),
                          button(
                              previewing.value
                                  ? messages.previewing
                                  : messages.preview,
                              () => {
                                  void showPreview(".contrib-preview-button");
                              },
                              {
                                  class: "contrib-preview-button",
                                  disabled: !canPreview.value,
                              },
                          ),
                      ];
                return h("div", { class: "contrib-footer" }, [
                    confirming ? null : link(metaPageUrl, messages.viewPage),
                    h("div", { class: "contrib-footer-actions" }, controls),
                ]);
            }

            function renderPreviewDialog(proposed: PendingPreview) {
                const revision = savedRevision.value;
                return h(
                    CdxDialog,
                    {
                        key: "preview",
                        class:
                            "sumire-contrib sumire-contrib--preview" +
                            (revision === null
                                ? ""
                                : " sumire-contrib--short"),
                        title: messages.previewTitle,
                        open: open.value,
                        useCloseButton: true,
                        closeButtonLabel: messages.close,
                        "onUpdate:open": (value: boolean) => {
                            if (!value) requestPreviewClose();
                        },
                    },
                    {
                        default: () =>
                            revision === null
                                ? [
                                      renderRequestError(),
                                      h("iframe", {
                                          class: "contrib-preview-frame",
                                          title: messages.previewTitle,
                                          sandbox: "",
                                          srcdoc: proposed.html,
                                      }),
                                  ]
                                : [
                                      h(
                                          CdxMessage,
                                          { type: "success" },
                                          { default: () => messages.saved },
                                      ),
                                      h(
                                          "p",
                                          { class: "contrib-revision-link" },
                                          [
                                              link(
                                                  revision,
                                                  messages.viewRevision,
                                              ),
                                          ],
                                      ),
                                  ],
                        footer: () =>
                            h("div", { class: "contrib-preview-footer" }, [
                                revision === null
                                    ? renderEditSummary(proposed)
                                    : null,
                                h(
                                    "div",
                                    { class: "contrib-footer-actions" },
                                    revision === null
                                        ? [
                                              button(
                                                  messages.backToEditing,
                                                  requestPreviewClose,
                                              ),
                                              button(
                                                  saving.value
                                                      ? messages.saving
                                                      : messages.save,
                                                  () => {
                                                      void submit();
                                                  },
                                                  {
                                                      action: "progressive",
                                                      weight: "primary",
                                                  },
                                              ),
                                          ]
                                        : [
                                              button(messages.done, close, {
                                                  class: "contrib-done-button",
                                                  action: "progressive",
                                                  weight: "primary",
                                              }),
                                          ],
                                ),
                            ]),
                    },
                );
            }

            return () => {
                const proposed = pendingPreview.value;
                if (proposed) return renderPreviewDialog(proposed);

                const confirming = discarding.value;
                return h(
                    CdxDialog,
                    {
                        key: "editor",
                        class: [
                            "sumire-contrib sumire-contrib--editor",
                            {
                                "sumire-contrib--short": confirming,
                                "sumire-contrib--contributions":
                                    !confirming &&
                                    activeTab.value === "contributions" &&
                                    contributions,
                            },
                        ],
                        title: confirming
                            ? messages.discardTitle
                            : messages.title,
                        open: open.value,
                        useCloseButton: true,
                        closeButtonLabel: messages.close,
                        "onUpdate:open": (value: boolean) => {
                            if (!value) requestEditorClose();
                        },
                    },
                    {
                        default: () =>
                            confirming
                                ? h("p", null, messages.discardBody)
                                : renderEditor(),
                        footer: renderEditorFooter,
                    },
                );
            };
        },
    });

    const priorFocus = document.activeElement;
    const style = document.createElement("style");
    style.textContent = contributionDialogStyles;
    const mount = document.createElement("div");
    document.head.append(style);
    document.body.append(mount);
    let mounted = false;
    try {
        app.mount(mount);
        mounted = true;
        open.value = true;
        await closed;
        await nextTick();
    } finally {
        if (mounted) app.unmount();
        mount.remove();
        style.remove();
        if (
            priorFocus &&
            "focus" in priorFocus &&
            typeof priorFocus.focus === "function"
        )
            priorFocus.focus();
    }
}
