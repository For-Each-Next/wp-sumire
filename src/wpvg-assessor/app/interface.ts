/**
 * @file src/wpvg-assessor/app/interface.ts
 * Purpose: Mounts the assessor UI in supported MediaWiki pages.
 *
 * Contents: Host startup, page actions, asynchronous dialog loading, and scoped mounts.
 */

import { consumeAssessorLauncher } from "../platform/browser/source-links.ts";
import { loadHostModules } from "../support/mediawiki-runtime/modules.ts";

import type { PageAssessorRuntime } from "./dialog-contracts.ts";
import {
    ASSESSMENT_DIALOG_STYLES,
    createAssessmentDialogComponent,
} from "../features/assessment/dialogs/assessment-dialog.ts";
import * as Comparison from "../features/assessment/components/wikitext-comparison.ts";
import {
    LOADING_DIALOG_STYLES,
    createLoadingDialogComponent,
} from "../features/assessment/dialogs/loading-dialog.ts";
import {
    type ResourceLoaderRequire,
    type VueModule,
} from "../features/assessment/codex.ts";
import { mountAssessorDialog } from "../features/assessment/dialog-mount.ts";
import { msg } from "../i18n/index.ts";
import {
    CATEGORY_DIALOG_STYLES,
    createCategoryDialogComponent,
} from "../features/assessment/dialogs/category-dialog.ts";
import {
    ARCHIVE_DIALOG_STYLES,
    createArchiveDialogComponent,
} from "../features/archive/dialogs/archive-dialog.ts";

const STYLE_ID = "sumire-wpvg-assessor-styles";

let activeAssessmentRestore: (() => void) | null = null;
let activeDialogCleanup: (() => void) | null = null;
let dialogGeneration = 0;
type PageRuntime = PageAssessorRuntime & { wiki: typeof mw; page: Window };
let runtime: PageRuntime | null = null;
let dialogTrigger: HTMLElement | null = null;

/**
 * Starts the dialog UI with composed workflow dependencies.
 */
export function startPageAssessor(
    dependencies: PageAssessorRuntime,
    wiki: typeof mw,
    page: Window,
): void {
    if (runtime != null) {
        return;
    }

    runtime = { ...dependencies, wiki, page };
    void initializePageAssessorRuntime(
        dependencies,
        () =>
            loadHostModules(wiki.loader, [
                "mediawiki.api",
                "mediawiki.Title",
                "mediawiki.util",
                "@wikimedia/codex",
            ]),
        init,
    );
}

/** Reports ResourceLoader or initialization failures during startup. */
export async function initializePageAssessorRuntime(
    feedback: Pick<PageAssessorRuntime, "logger" | "notify">,
    loadDependencies: () => PromiseLike<unknown> | unknown,
    initialize: () => void,
): Promise<void> {
    try {
        await loadDependencies();
        initialize();
    } catch (error) {
        feedback.logger.error("initialize.failed", { error });
        feedback.notify({
            key: "initialize-failed",
            message: msg("tool.startFailed", {
                error: getErrorMessage(error),
            }),
            type: "error",
        });
    }
}

/**
 * Mounts the toolbox action after MediaWiki is ready.
 */
function init(): void {
    const { wiki, page, logger } = getRuntime();
    const dbName = wiki.config.get("wgDBname");
    const namespaceNumber = wiki.config.get("wgNamespaceNumber");

    logger.debug("initialize.started", {
        dbName,
        namespaceNumber,
    });
    if (dbName !== "zhwiki" || namespaceNumber < 0) {
        logger.debug("initialize.skipped");
        return;
    }

    installDialogStyles();
    addToolboxLink();
    if (consumeAssessorLauncher(page)) {
        openPageDialog();
    }
}

function addToolboxLink(): void {
    const { wiki, logger } = getRuntime();
    logger.debug("toolbox-link.install.started");
    const label = msg(
        isNewPageList()
            ? "tool.archiveName"
            : isUnassessedCategory()
              ? "tool.batchName"
              : "tool.name",
    );
    const link = wiki.util.addPortletLink(
        "p-tb",
        "#",
        label,
        "sumire-wpvg-assessor-launcher",
    );
    if (!link) return;
    const anchor = link.querySelector("a");
    if (!anchor) return;
    anchor.addEventListener("click", handleToolboxClick);
}

function handleToolboxClick(event: Event): void {
    event.preventDefault();
    dialogTrigger =
        event.currentTarget instanceof window.HTMLElement
            ? event.currentTarget
            : null;
    getRuntime().logger.info("toolbox-link.activated");
    openPageDialog();
}

function openPageDialog(): void {
    if (activeAssessmentRestore != null) {
        activeAssessmentRestore();
        return;
    }
    (isNewPageList()
        ? openArchiveDialog()
        : isUnassessedCategory()
          ? openCategoryDialog()
          : openDialog()
    ).catch(handleOpenDialogError);
}

function isNewPageList(): boolean {
    const { wiki } = getRuntime();
    if (wiki.config.get("wgNamespaceNumber") !== 102) return false;
    const title = wiki.Title.newFromText(wiki.config.get("wgPageName"));
    return (
        title != null &&
        ["电子游戏/新进条目", "電子遊戲/新進條目"].includes(
            title.getMainText(),
        )
    );
}

async function openArchiveDialog(): Promise<void> {
    const generation = ++dialogGeneration;
    const assessorRuntime = getRuntime();
    const workflow = assessorRuntime.archiveNewPages;
    if (workflow == null)
        throw new Error("New-page archiving is unavailable.");
    const require = await loadVueAndCodex();
    if (generation !== dialogGeneration) return;
    activeDialogCleanup?.();
    mountDialog(require, (Vue, onClose) =>
        createArchiveDialogComponent(Vue, {
            api: assessorRuntime.createDialogPageContext().api,
            runtime: assessorRuntime,
            workflow,
            onClose,
        }),
    );
}

function isUnassessedCategory(): boolean {
    const { wiki } = getRuntime();
    if (wiki.config.get("wgNamespaceNumber") !== 14) return false;
    const title = wiki.Title.newFromText(wiki.config.get("wgPageName"));
    return (
        title != null &&
        ["未评级电子游戏条目", "未評級電子遊戲條目"].includes(
            title.getMainText(),
        )
    );
}

async function openCategoryDialog(): Promise<void> {
    const generation = ++dialogGeneration;
    const assessorRuntime = getRuntime();
    const workflow = assessorRuntime.categoryAssessment;
    if (workflow == null) {
        throw new Error("Category assessment is unavailable.");
    }
    const sessionPromise = workflow.open(
        assessorRuntime.createDialogPageContext().api,
    );
    void sessionPromise.catch(() => undefined);
    function releasePendingSession(): void {
        void sessionPromise
            .then(
                (session) => session.dispose(),
                () => undefined,
            )
            .catch((error: unknown) => {
                assessorRuntime.logger.warn(
                    "category.session.dispose.failed",
                    {
                        error,
                    },
                );
            });
    }
    let require: ResourceLoaderRequire;
    try {
        require = await loadVueAndCodex();
        if (generation !== dialogGeneration) {
            releasePendingSession();
            return;
        }
        activeDialogCleanup?.();
        mountLoadingDialog(require);
    } catch (error) {
        releasePendingSession();
        throw error;
    }
    let session: Awaited<ReturnType<typeof workflow.open>>;
    try {
        session = await sessionPromise;
    } catch (error) {
        if (generation !== dialogGeneration) return;
        activeDialogCleanup?.();
        throw error;
    }
    if (generation !== dialogGeneration) {
        session.dispose();
        return;
    }
    try {
        activeDialogCleanup?.();
    } catch (error) {
        releasePendingSession();
        throw error;
    }
    mountDialog(
        require,
        (Vue, onClose) =>
            createCategoryDialogComponent(Vue, {
                runtime: assessorRuntime,
                session,
                onClose,
            }),
        () => session.dispose(),
    );
}

function handleOpenDialogError(error: unknown): void {
    const assessorRuntime = getRuntime();
    assessorRuntime.logger.error("dialog.open.failed", { error });
    assessorRuntime.notify({
        key: "dialog-open-failed",
        message: msg("tool.openFailed", { error: getErrorMessage(error) }),
        type: "error",
    });
}

async function openDialog(): Promise<void> {
    const generation = ++dialogGeneration;
    const assessorRuntime = getRuntime();

    assessorRuntime.logger.info("dialog.open.started");
    const statePromise = loadDialogStateForCurrentPage(assessorRuntime);
    // Observe early failures while ResourceLoader is still preparing the UI.
    // The original promise is awaited below so the normal failure UI still runs.
    void statePromise.catch(function observeEarlyStateFailure() {
        return undefined;
    });
    const require = await loadVueAndCodex();
    if (generation !== dialogGeneration) {
        return;
    }

    activeDialogCleanup?.();
    mountLoadingDialog(require);
    let state: Awaited<ReturnType<PageAssessorRuntime["loadDialogState"]>>;
    try {
        state = await statePromise;
    } catch (error) {
        if (generation !== dialogGeneration) {
            return;
        }
        activeDialogCleanup?.();
        throw error;
    }
    if (generation !== dialogGeneration) {
        return;
    }
    activeDialogCleanup?.();
    mountAssessmentDialog(require, state, assessorRuntime);
    assessorRuntime.logger.info("dialog.open.completed");
}

/** Loads state with browser values supplied by the composition root. */
function loadDialogStateForCurrentPage(
    assessorRuntime: Pick<
        PageAssessorRuntime,
        "createDialogPageContext" | "loadDialogState"
    >,
): ReturnType<PageAssessorRuntime["loadDialogState"]> {
    const { api, pageName, title } = assessorRuntime.createDialogPageContext();

    if (title == null) {
        throw new Error(`Unable to resolve the current page: ${pageName}`);
    }
    return assessorRuntime.loadDialogState(api, title);
}

async function loadVueAndCodex(): Promise<ResourceLoaderRequire> {
    return (await loadHostModules(getRuntime().wiki.loader, [
        "vue",
        "@wikimedia/codex",
        "mediawiki.diff.styles",
    ])) as ResourceLoaderRequire;
}

function mountLoadingDialog(require: ResourceLoaderRequire): void {
    mountDialog(require, (Vue, close) =>
        createLoadingDialogComponent(Vue, () => {
            dialogGeneration += 1;
            close();
        }),
    );
}

function mountAssessmentDialog(
    require: ResourceLoaderRequire,
    state: Awaited<ReturnType<PageAssessorRuntime["loadDialogState"]>>,
    assessorRuntime: PageAssessorRuntime,
): void {
    mountDialog(require, (Vue, onClose) =>
        createAssessmentDialogComponent(Vue, {
            onClose,
            onSaved: refreshPage,
            registerRestore(handler) {
                activeAssessmentRestore = handler;
            },
            runtime: assessorRuntime,
            state,
        }),
    );
}

function mountDialog(
    require: ResourceLoaderRequire,
    createComponent: (Vue: VueModule, close: () => void) => unknown,
    onDispose?: () => void,
): void {
    let disposed = false;
    const cleanup = mountAssessorDialog({
        require,
        createComponent,
        onClose: restoreToolboxFocus,
        onDispose() {
            disposed = true;
            activeDialogCleanup = null;
            onDispose?.();
        },
    });
    if (!disposed) activeDialogCleanup = cleanup;
}

function refreshPage(): void {
    location.reload();
}

function restoreToolboxFocus(): void {
    if (dialogTrigger?.isConnected) {
        dialogTrigger.focus();
        return;
    }
    document
        .querySelector<HTMLElement>("#sumire-wpvg-assessor-launcher a")
        ?.focus();
}

function installDialogStyles(): void {
    if (document.getElementById(STYLE_ID) != null) {
        getRuntime().logger.debug("styles.install.skipped");
        return;
    }

    const style = document.createElement("style");

    style.id = STYLE_ID;
    style.textContent = [
        ASSESSMENT_DIALOG_STYLES,
        LOADING_DIALOG_STYLES,
        Comparison.WIKITEXT_COMPARISON_STYLES,
        CATEGORY_DIALOG_STYLES,
        ARCHIVE_DIALOG_STYLES,
    ].join("\n");
    document.head.append(style);
    getRuntime().logger.debug("styles.install.completed");
}

function getRuntime(): PageRuntime {
    if (runtime == null) {
        throw new Error("Page assessor UI has not been composed.");
    }
    return runtime;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
