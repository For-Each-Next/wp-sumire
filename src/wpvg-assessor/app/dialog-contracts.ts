/**
 * @file src/wpvg-assessor/app/dialog-contracts.ts
 * Purpose: Contracts shared by composition, dialog UI, and workflows.
 *
 * Contents: Dialog state, reviewed saves, and composed runtime contracts.
 */

import type {
    NewPageListSnapshot,
    PreparedTalkEdit,
} from "../domain/types.ts";
import type { DialogSnapshot } from "../domain/assessment-snapshot.ts";
import type { Logger } from "../support/logging/logger.ts";
import type { ActionNotifier } from "../support/notifications/contracts.ts";
import type { AssessmentStagingWorkflow } from "./staging-contracts.ts";
import type { NewPageArchiveWorkflow } from "./archive-contracts.ts";
import type {
    CategoryAssessmentWorkflow,
    CategoryArticleStyles,
} from "./category-contracts.ts";
import type { AssessmentSaveReview } from "./assessment-contracts.ts";

export interface DialogState extends DialogSnapshot {
    api: mw.Api;
}

/** Browser context created for one dialog-opening attempt. */
export interface DialogPageContext {
    api: mw.Api;
    pageName: string;
    title: mw.Title | null;
}

type CreateDialogPageContext = () => DialogPageContext;

export interface RegistrationSave {
    proposedText: string;
    snapshot: NewPageListSnapshot;
}

export type LoadDialogState = (
    api: mw.Api,
    currentTitle: mw.Title,
) => Promise<DialogState>;

export interface DialogSaveReview extends AssessmentSaveReview {
    listSummary: string;
    shouldRegister: boolean;
}

export type DialogSavePhase = "registration" | "talk-page";
export type DialogSaveOutcome = "saved" | "unchanged";
export type ReportDialogSavePhase = (phase: DialogSavePhase) => void;

export type SaveTalkAssessment = (
    api: mw.Api,
    edit: PreparedTalkEdit,
) => Promise<string>;

export interface PageAssessorRuntime {
    createDialogPageContext: CreateDialogPageContext;
    loadDialogState: LoadDialogState;
    logger: Logger;
    notify: ActionNotifier;
    staging: AssessmentStagingWorkflow;
    categoryAssessment?: CategoryAssessmentWorkflow;
    archiveNewPages?: NewPageArchiveWorkflow;
    getArticlePreviewStyles?(): CategoryArticleStyles;
}
