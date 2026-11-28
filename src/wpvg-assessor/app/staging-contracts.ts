/**
 * @file src/wpvg-assessor/app/staging-contracts.ts
 * Purpose: Contracts for background assessment drafts and reviewed batch submission.
 *
 * Contents: Reviewed drafts, queue storage, batch submissions, and cached loads.
 */

import type {
    DialogSaveOutcome,
    DialogSaveReview,
    DialogState,
    RegistrationSave,
    ReportDialogSavePhase,
} from "./dialog-contracts.ts";
import type { NewPageListSnapshot } from "../domain/types.ts";
import type { DialogSnapshot } from "../domain/assessment-snapshot.ts";

export interface StagedAssessment {
    state: DialogSnapshot;
    review: DialogSaveReview;
}

export interface AssessmentSessionData {
    drafts: StagedAssessment[];
    pages: Record<string, DialogSnapshot>;
    newPageList: NewPageListSnapshot | null;
}

export interface AssessmentSessionStore {
    read(): AssessmentSessionData;
    readNextEditAt?(): number;
    writeNextEditAt?(timestamp: number): boolean | void;
    write(data: AssessmentSessionData): void;
    subscribe(listener: () => void): () => void;
    runExclusive<T>(operation: () => Promise<T>): Promise<T>;
}

export interface PreparedAssessmentBatch {
    entries: StagedAssessment[];
    registration: RegistrationSave | null;
    registrationSummary: string;
    draftSnapshot: string;
}

export interface BatchSaveProgress {
    completed: number;
    total: number;
    title: string;
    phase: "waiting" | "saving" | "complete";
    waitSeconds: number;
}

export type ReportBatchSaveProgress = (progress: BatchSaveProgress) => void;

export interface AssessmentStagingWorkflow {
    count(): number;
    getReview(talkTitle: string): DialogSaveReview | null;
    stage(state: DialogState, review: DialogSaveReview): Promise<void>;
    unstage(talkTitle: string): Promise<void>;
    subscribe(listener: () => void): () => void;
    prepare(
        state: DialogState,
        review: DialogSaveReview,
    ): Promise<PreparedAssessmentBatch>;
    prepareSelection(
        api: mw.Api,
        selected: StagedAssessment[],
        draftSnapshot: string,
    ): Promise<PreparedAssessmentBatch>;
    removeFromBatch(
        batch: PreparedAssessmentBatch,
        talkTitle: string,
    ): Promise<PreparedAssessmentBatch>;
    updateInBatch(
        batch: PreparedAssessmentBatch,
        talkTitle: string,
        state: DialogState,
        review: DialogSaveReview,
    ): Promise<PreparedAssessmentBatch>;
    save(
        api: mw.Api,
        batch: PreparedAssessmentBatch,
        reportPhase: ReportDialogSavePhase,
        reportProgress?: ReportBatchSaveProgress,
    ): Promise<DialogSaveOutcome>;
}
