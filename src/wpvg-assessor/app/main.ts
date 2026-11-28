/**
 * @file src/wpvg-assessor/app/main.ts
 * Purpose: Composes the page-assessor UI, workflows, and MediaWiki adapters.
 *
 * Contents: Composition, page context, and host adapters.
 */

import { NEW_PAGE_LIST_TITLE } from "../domain/new-page-list.ts";
import { createAssessmentPageApi } from "../platform/mediawiki/page-source/assessment-pages.ts";
import { createNewPageListApi } from "../platform/mediawiki/page-source/new-page-list.ts";
import { createArchivePageApi } from "../platform/mediawiki/page-source/archive-page.ts";
import { createNewPageArchiveWorkflow } from "./archive-new-pages.ts";
import { createPageMetadataApi } from "../platform/mediawiki/page-metadata.ts";
import { createTalkPageApi } from "../platform/mediawiki/page-source/talk-page.ts";
import * as associatedTitle from "../platform/mediawiki/title.ts";
import { createCreationTimeCacheStore } from "../platform/browser/creation-time-cache.ts";
import { createAssessmentSessionStore } from "../platform/browser/assessment-session.ts";
import { clearAssessmentLocalStorage } from "../platform/browser/local-storage.ts";
import projectConfig from "../domain/project-config.ts";
import type { DialogPageContext } from "./dialog-contracts.ts";
import { configureInterfaceLanguage, msg } from "../i18n/index.ts";
import { startPageAssessor } from "./interface.ts";
import { createDialogStateLoader } from "./dialog-state.ts";
import { createNewPageListReader } from "./new-page-list-reader.ts";
import { createTalkSaveWorkflow } from "./save-talk-assessment.ts";
import {
    createAssessmentStagingWorkflow,
    createCachedDialogLoader,
} from "./staged-assessments.ts";
import { createLogger, type Logger } from "../support/logging/logger.ts";
import { createActionNotifier } from "../support/notifications/action-notifier.ts";
import { createCategoryApi } from "../platform/mediawiki/category-api.ts";
import { createCategoryAssessmentWorkflow } from "./category-assessment.ts";
import { createAssessmentStateLoader } from "./assessment-state.ts";
import { createReviewedAssessmentSaveWorkflow } from "./save-assessment.ts";
import { getArticlePreviewStyles } from "../platform/browser/article-preview-styles.ts";

const STARTUP_KEY = Symbol.for("sumire.wpvg-assessor.startup");
const CLEAR_LOCAL_STORAGE = Symbol.for(
    "sumire.wpvg-assessor.clear-local-storage",
);

/** Starts the composed browser gadget. */
export function start(wiki: typeof mw, page: Window): void {
    const pageGlobals = page as unknown as Record<PropertyKey, unknown>;
    if (pageGlobals[STARTUP_KEY] != null) return;
    // Claim the page before composing workflows or requesting host modules so
    // combined and individual installations retain one assessment owner.
    const owner = {};
    pageGlobals[STARTUP_KEY] = owner;
    try {
        initialize(wiki, page);
    } catch (error) {
        if (pageGlobals[STARTUP_KEY] === owner)
            delete pageGlobals[STARTUP_KEY];
        throw error;
    }
}

/** Composes assessment workflows and starts their owned interface. */
function initialize(wiki: typeof mw, page: Window): void {
    configureInterfaceLanguage(
        wiki.config.get("wgUserLanguage"),
        wiki.config.get("wgUserVariant"),
    );
    const logger = createLogger("wpvg-assessor", {
        level: page.wpvgAssessorConfig?.logLevel,
    });
    const adapters = createMediaWikiAdapters(logger);
    const identity = JSON.stringify([
        wiki.config.get("wgDBname"),
        wiki.config.get("wgUserName"),
    ]);
    const getSubjectPageTitle = (title: mw.Title) =>
        associatedTitle.getSubjectPageTitle(wiki.Title, title);
    const getTalkPageTitle = (title: mw.Title) =>
        associatedTitle.getTalkPageTitle(wiki.Title, title);
    const session = createAssessmentSessionStore(
        logger.child("storage.assessment-session"),
        identity,
    );
    const newPageList = createNewPageListReader({
        fetchAssessmentPages: adapters.assessmentPages.fetchAssessmentPages,
        fetchTalkPage: adapters.talkPage.fetchTalkPage,
        fetchNewPageList: adapters.newPageList.fetchNewPageList,
        readTabSnapshot: session.readCachedNewPageList,
    });
    const loadDialogState = createDialogStateLoader(
        {
            fetchAssessmentPages: newPageList.fetchAssessmentPages,
            fetchPageCreationTimes:
                adapters.pageMetadata.fetchPageCreationTimes,
            fetchSubjectPageInfo: adapters.pageMetadata.fetchSubjectPageInfo,
            getSubjectPageTitle,
            getTalkPageTitle,
        },
        projectConfig,
    );
    const saveTalkAssessment = createTalkSaveWorkflow({
        fetchPageText: adapters.talkPage.fetchTalkPage,
        logger: logger.child("workflow.talk-save"),
        postTalkPageEdit: adapters.talkPage.postTalkPageEdit,
    });
    const cache = createCachedDialogLoader({
        getTalkPageTitle,
        loadDialogState,
        logger: logger.child("workflow.dialog-cache"),
        session,
    });
    async function savePreparedNewPageList(
        ...args: Parameters<
            typeof adapters.newPageList.savePreparedNewPageList
        >
    ): Promise<void> {
        try {
            await adapters.newPageList.savePreparedNewPageList(...args);
        } finally {
            newPageList.invalidate();
            cache.invalidate();
        }
    }
    const notify = createActionNotifier("wpvg-assessor", (message, options) =>
        wiki.notify(message, options),
    );
    const loadAssessmentState = createAssessmentStateLoader(
        {
            fetchPageText: adapters.talkPage.fetchTalkPage,
            getSubjectPageTitle,
            getTalkPageTitle,
        },
        projectConfig,
    );
    const saveReviewedAssessment = createReviewedAssessmentSaveWorkflow({
        logger: logger.child("workflow.assessment-save"),
        saveTalkAssessment,
    });
    const staging = createAssessmentStagingWorkflow(
        {
            changedBatchMessage: () => msg("dialog.batchChanged"),
            fetchNewPageList: newPageList.fetchNewPageList,
            fetchPageCreationTimes:
                adapters.pageMetadata.fetchPageCreationTimes,
            logger: logger.child("workflow.staging"),
            savePreparedNewPageList,
            saveReviewedAssessment,
            session,
        },
        projectConfig,
    );

    startPageAssessor(
        {
            archiveNewPages: createNewPageArchiveWorkflow({
                sourceTitle: NEW_PAGE_LIST_TITLE,
                fetchNewPageList: adapters.newPageList.fetchNewPageList,
                fetchPageText: adapters.archive.fetchPageText,
                savePreparedNewPageList,
                saveArchivePage: adapters.archive.saveArchivePage,
                now: () => new Date(),
            }),
            categoryAssessment: createCategoryAssessmentWorkflow({
                ...adapters.category,
                loadAssessmentState,
                async saveReviewedAssessment(state, review) {
                    try {
                        return await saveReviewedAssessment(state, review);
                    } finally {
                        cache.invalidate();
                    }
                },
                onSaveFailed(error) {
                    notify({
                        key: "category-save-failed",
                        message: msg("batch.saveFailed", {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        }),
                        type: "error",
                    });
                },
                resolveTitle: (title) => wiki.Title.newFromText(title),
                logger: logger.child("workflow.category"),
            }),
            createDialogPageContext: () => createDialogPageContext(wiki),
            getArticlePreviewStyles,
            loadDialogState: cache.load,
            logger: logger.child("ui"),
            notify,
            staging: {
                ...staging,
                async save(api, batch, reportPhase, reportProgress) {
                    try {
                        return await staging.save(
                            api,
                            batch,
                            reportPhase,
                            reportProgress,
                        );
                    } finally {
                        cache.invalidate();
                    }
                },
            },
        },
        wiki,
        page,
    );
    Object.defineProperty(page, CLEAR_LOCAL_STORAGE, {
        configurable: true,
        value: () => clearAssessmentLocalStorage(identity),
    });
}

/** Creates external MediaWiki values for one dialog-opening attempt. */
function createDialogPageContext(wiki: typeof mw): DialogPageContext {
    const pageName = wiki.config.get("wgPageName");

    return {
        api: new wiki.Api(),
        pageName,
        title: wiki.Title.newFromText(pageName),
    };
}

function createMediaWikiAdapters(logger: Logger) {
    const mediaWikiLogger = logger.child("mediawiki");
    const cache = createCreationTimeCacheStore(logger.child("storage"));
    return Object.freeze({
        archive: createArchivePageApi(mediaWikiLogger.child("archive")),
        assessmentPages: createAssessmentPageApi(
            mediaWikiLogger.child("assessment-page"),
        ),
        category: createCategoryApi(mediaWikiLogger.child("category")),
        newPageList: createNewPageListApi(
            mediaWikiLogger.child("new-page-list"),
        ),
        pageMetadata: createPageMetadataApi(
            mediaWikiLogger.child("page"),
            cache,
        ),
        talkPage: createTalkPageApi(mediaWikiLogger.child("talk-page")),
    });
}
