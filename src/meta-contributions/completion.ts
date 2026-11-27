import {
    completedAssessmentCodes,
    reviewCodeForAssessment,
} from "./assessment.ts";
import type {
    CompletedSectionId,
    ContributionEntry,
    ContributionSection,
} from "./contributions.ts";
import { formatPageTitle } from "./page-title.ts";

export function completionDestination(
    activity: string,
): CompletedSectionId | null {
    const type = activity.trim().toLowerCase();
    if (type === "draft") return "articles";
    if (type === "rev" || type === "ce") return "reviews";
    return null;
}

/** Move an entry within the dialog draft. The user can still edit the suggested fields before saving. */
export function moveCompletedEntry<Note>(
    sections: readonly ContributionSection<Note>[],
    entryId: string,
    destination: CompletedSectionId,
    completedAt = new Date(),
): ContributionEntry<Note> | null {
    const working = sections.find(({ id }) => id === "working");
    const target = sections.find(({ id }) => id === destination);
    if (!working || !target || working === target) return null;

    const index = working.entries.findIndex(({ id }) => id === entryId);
    const entry = working.entries[index];
    if (!entry?.title.trim()) return null;

    const title = formatPageTitle(entry.title.trim());
    const finalTitle =
        destination === "reviews"
            ? formatPageTitle(entry.talk.trim()) || title
            : title.replace(/^(?:draft|草稿)[ _]*:[ _]*/iu, "") || title;
    const month = String(completedAt.getMonth() + 1).padStart(2, "0");
    let status = completedAssessmentCodes[destination].includes(entry.status)
        ? entry.status
        : "";
    if (!status && destination === "reviews") {
        status =
            entry.type.trim().toLowerCase() === "ce"
                ? "ce"
                : reviewCodeForAssessment(entry.status);
    }
    const completed: ContributionEntry<Note> = {
        ...entry,
        title: finalTitle,
        label:
            entry.label ||
            (destination === "reviews" && finalTitle !== title ? title : ""),
        site:
            entry.site.trim() ||
            (working.defaultSite === target.defaultSite
                ? ""
                : working.defaultSite),
        status,
        date: entry.date || `${completedAt.getFullYear()}-${month}`,
        type: "",
        draft: "",
        talk: "",
    };
    working.entries.splice(index, 1);
    target.entries.unshift(completed);
    return completed;
}
