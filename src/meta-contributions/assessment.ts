import type { CompletedSectionId } from "./contributions.ts";

const reviewableAssessmentCodes = [
    "fa",
    "fl",
    "a",
    "al",
    "ga",
    "bplus",
    "b",
    "bl",
] as const;
export const articleAssessmentCodes = [
    ...reviewableAssessmentCodes,
    "c",
    "cl",
    "start",
    "list",
    "stub",
    "sl",
] as const;

export const completedAssessmentCodes: Record<
    CompletedSectionId,
    readonly string[]
> = {
    articles: [...articleAssessmentCodes, "???"],
    reviews: [
        "pr",
        "ce",
        ...reviewableAssessmentCodes.map((code) => `${code}-rev`),
    ],
};

export function reviewCodeForAssessment(assessment: string): string {
    const code = `${assessment}-rev`;
    return completedAssessmentCodes.reviews.includes(code) ? code : "";
}
