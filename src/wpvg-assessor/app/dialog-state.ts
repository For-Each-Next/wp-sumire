/**
 * @file src/wpvg-assessor/app/dialog-state.ts
 * Purpose: Orchestrates dialog loading and new-page-list preparation.
 *
 * Contents: Initial page loading and registration preparation.
 */

import type { DialogState, LoadDialogState } from "./dialog-contracts.ts";
import {
    createDefaultAssessment,
    hasDykInviteAtTop,
} from "../domain/assessment.ts";
import {
    getTitlesForDate,
    prepareNewPageListRegistration,
} from "../domain/new-page-list.ts";
import type {
    AssessmentPageSnapshots,
    RegistrationResult,
    SubjectPageInfo,
} from "../domain/types.ts";
import type { ProjectConfig } from "../domain/project-types.ts";

interface PreparedRegistrationState {
    creationTimes: Map<string, Date>;
    registration: RegistrationResult;
}

interface DialogStateLoaderAdapters {
    fetchAssessmentPages(
        api: mw.Api,
        talkTitle: string,
    ): Promise<AssessmentPageSnapshots>;
    fetchPageCreationTimes(
        api: mw.Api,
        titles: Array<string>,
    ): Promise<Map<string, Date>>;
    fetchSubjectPageInfo(api: mw.Api, title: string): Promise<SubjectPageInfo>;
    getSubjectPageTitle(title: mw.Title): string;
    getTalkPageTitle(title: mw.Title): string;
}

/** Reads the assessment and prepares registration eligibility for the current page. */
export function createDialogStateLoader(
    adapters: DialogStateLoaderAdapters,
    projectConfig: ProjectConfig,
): LoadDialogState {
    return loadDialogState.bind(null, adapters, projectConfig);
}

async function loadDialogState(
    adapters: DialogStateLoaderAdapters,
    projectConfig: ProjectConfig,
    api: mw.Api,
    currentTitle: mw.Title,
): Promise<DialogState> {
    const talkTitle = adapters.getTalkPageTitle(currentTitle);
    const subjectTitle = adapters.getSubjectPageTitle(currentTitle);
    const [pages, subjectInfo] = await Promise.all([
        adapters.fetchAssessmentPages(api, talkTitle),
        adapters.fetchSubjectPageInfo(api, subjectTitle),
    ]);
    const prepared = await prepareRegistrationState(
        adapters,
        api,
        pages,
        subjectInfo,
        subjectTitle,
    );

    return {
        api,
        assessment: createDefaultAssessment(
            projectConfig,
            pages.talkPage.text,
        ),
        creationTimes: prepared.creationTimes,
        newPageList: pages.newPageList,
        page: pages.talkPage,
        previewDirty: false,
        registration: prepared.registration,
        subjectInfo,
        subjectTitle,
        summaryDirty: false,
        talkTitle,
    };
}

async function prepareRegistrationState(
    adapters: DialogStateLoaderAdapters,
    api: mw.Api,
    pages: AssessmentPageSnapshots,
    subjectInfo: SubjectPageInfo,
    subjectTitle: string,
): Promise<PreparedRegistrationState> {
    const newPageList = pages.newPageList;
    const title = subjectInfo.listedTitle || subjectTitle;
    const registrationOptions = {
        creationDate: subjectInfo.creationDate,
        includeDykIcon: hasDykInviteAtTop(pages.talkPage.text),
        namespaceNumber: subjectInfo.namespaceNumber,
        text: newPageList.text,
        title,
    };
    const registration = prepareNewPageListRegistration(registrationOptions);

    if (!registration.changed) {
        return {
            creationTimes: new Map([[title, subjectInfo.creationDate]]),
            registration,
        };
    }

    const titles = [
        ...getTitlesForDate(newPageList.text, subjectInfo.creationDate),
        title,
    ];
    const creationTimes = await adapters.fetchPageCreationTimes(api, titles);

    creationTimes.set(title, subjectInfo.creationDate);
    return {
        creationTimes,
        registration: prepareNewPageListRegistration({
            ...registrationOptions,
            creationTimes,
        }),
    };
}
