/**
 * @file src/wpvg-assessor/app/assessment-contracts.ts
 * Purpose: Talk-page assessment data shared by the assessment-only workflow and UI.
 *
 * Contents: Assessment state and reviewed-save contracts.
 */

import type { AssessmentSnapshot } from "../domain/assessment-snapshot.ts";
import type { DialogSaveOutcome } from "./dialog-contracts.ts";

export interface AssessmentState extends AssessmentSnapshot {
    api: mw.Api;
}

export interface AssessmentSaveReview {
    previewText: string;
    summary: string;
}

export type SaveReviewedAssessment = (
    state: Pick<AssessmentState, "api" | "page" | "talkTitle">,
    review: AssessmentSaveReview,
) => Promise<DialogSaveOutcome>;
