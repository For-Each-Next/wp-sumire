/**
 * @file src/wpvg-assessor/domain/assessment-snapshot.ts
 * Purpose: Capture reviewed assessment values independently of UI and host state.
 * Contents: Plain snapshots for category reviews and staged drafts.
 */

import type {
    Assessment,
    NewPageListSnapshot,
    PageSnapshot,
    RegistrationResult,
    SubjectPageInfo,
} from "./types.ts";

export interface AssessmentSnapshot {
    assessment: Assessment;
    page: PageSnapshot;
    previewDirty: boolean;
    subjectTitle: string;
    summaryDirty: boolean;
    talkTitle: string;
}

export interface DialogSnapshot extends AssessmentSnapshot {
    creationTimes: Map<string, Date>;
    newPageList: NewPageListSnapshot;
    registration: RegistrationResult;
    subjectInfo: SubjectPageInfo;
}

export function copyAssessment(assessment: Assessment): Assessment {
    return {
        ...assessment,
        maintenance: { ...assessment.maintenance },
        otherProjects: { ...assessment.otherProjects },
        taskForces: { ...assessment.taskForces },
    };
}

export function copyAssessmentSnapshot(
    snapshot: AssessmentSnapshot,
): AssessmentSnapshot {
    return {
        assessment: copyAssessment(snapshot.assessment),
        page: { ...snapshot.page },
        previewDirty: snapshot.previewDirty,
        subjectTitle: snapshot.subjectTitle,
        summaryDirty: snapshot.summaryDirty,
        talkTitle: snapshot.talkTitle,
    };
}

export function copyDialogSnapshot(snapshot: DialogSnapshot): DialogSnapshot {
    // Copy reactive containers to plain values before cloning the dates.
    const { registration } = snapshot;
    return structuredClone({
        ...copyAssessmentSnapshot(snapshot),
        creationTimes: new Map(snapshot.creationTimes),
        newPageList: { ...snapshot.newPageList },
        registration: {
            ...registration,
            existing: registration.existing && { ...registration.existing },
        },
        subjectInfo: { ...snapshot.subjectInfo },
    });
}
