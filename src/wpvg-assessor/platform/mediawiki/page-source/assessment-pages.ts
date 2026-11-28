/**
 * @file src/wpvg-assessor/platform/mediawiki/page-source/assessment-pages.ts
 * Purpose: Loads the talk assessment and WikiProject log in one API query.
 *
 * Contents: Combined talk/list reads and validated snapshot decoding.
 */

import type { Logger } from "../../../support/logging/logger.ts";
import { NEW_PAGE_LIST_TITLE } from "../../../domain/new-page-list.ts";
import type { AssessmentPageSnapshots } from "../../../domain/types.ts";
import { createLoggedApiRequests } from "../api-requests.ts";
import { decodeNewPageListSnapshot } from "./new-page-list.ts";
import { createPageSourceParams, readPageSourceQuery } from "./query.ts";
import { decodeTalkPageSnapshot } from "./talk-page.ts";

export interface AssessmentPageApi {
    fetchAssessmentPages(
        api: mw.Api,
        talkTitle: string,
    ): Promise<AssessmentPageSnapshots>;
}

/** Creates the assessment-page adapter with scoped diagnostics. */
export function createAssessmentPageApi(logger: Logger): AssessmentPageApi {
    const requests = createLoggedApiRequests(logger.child("request"));
    async function fetchAssessmentPages(
        api: mw.Api,
        talkTitle: string,
    ): Promise<AssessmentPageSnapshots> {
        const titles = [talkTitle, NEW_PAGE_LIST_TITLE];
        logger.debug("assessment-pages.fetch.started", {
            itemCount: titles.length,
        });
        const response = await requests.get(
            api,
            "assessment-pages.fetch",
            createPageSourceParams(titles.join("|")),
        );
        const result = decodeAssessmentPagesResponse(response, talkTitle);
        logger.info("assessment-pages.fetch.completed", {
            logCharacterCount: result.newPageList.text.length,
            talkExists: result.talkPage.exists,
            talkCharacterCount: result.talkPage.text.length,
            itemCount: titles.length,
        });
        return result;
    }
    return Object.freeze({ fetchAssessmentPages });
}

/** Decodes the two requested pages independently of their response order. */
function decodeAssessmentPagesResponse(
    response: unknown,
    talkTitle: string,
): AssessmentPageSnapshots {
    const { pages, starttimestamp } = readPageSourceQuery(response);
    const logPage = pages.find((page) => page.title === NEW_PAGE_LIST_TITLE);
    // A normalized talk title can differ from the requested title.
    const talkPage =
        pages.find((page) => page.title === talkTitle) ??
        pages.find((page) => page !== logPage);
    return {
        newPageList: decodeNewPageListSnapshot(logPage, starttimestamp),
        talkPage: decodeTalkPageSnapshot(talkPage, starttimestamp),
    };
}
