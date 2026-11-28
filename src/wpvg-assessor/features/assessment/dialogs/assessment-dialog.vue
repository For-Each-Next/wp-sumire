<template>
    <cdx-dialog
        v-if="!batchEditor"
        :open="open && !batchConfirmOpen && !minimized"
        class="sumire-wpvg-assessor-dialog"
        :title="dialogTitle"
        :lang="interfaceLocale"
        :close-button-label="msg('dialog.close')"
        @update:open="onOpenChange"
    >
        <template #footer>
            <div
                class="sumire-wpvg-assessor-dialog__actions"
                :class="{
                    'sumire-wpvg-assessor-dialog__actions--stacked':
                        stackedActions,
                }"
            >
                <cdx-button
                    v-for="action in footerActions"
                    :key="action.id"
                    :action="action.action"
                    :weight="action.weight"
                    :disabled="action.disabled"
                    @click="action.activate"
                >
                    {{ action.label }}
                </cdx-button>
            </div>
        </template>
        <div class="sumire-wpvg-assessor-dialog__body">
            <div
                class="sumire-wpvg-assessor-status-region"
                aria-live="polite"
                aria-atomic="true"
            >
                <cdx-message
                    v-if="status"
                    class="sumire-wpvg-assessor-status"
                    :type="statusType"
                >
                    {{ status }}
                </cdx-message>
                <cdx-progress-bar
                    v-if="saving || preparing"
                    class="sumire-wpvg-assessor-save-progress"
                    :aria-label="status || msg('dialog.saving')"
                />
            </div>

            <div
                class="sumire-wpvg-assessor-assessment-grid"
                :aria-busy="saving || preparing"
            >
                <div class="sumire-wpvg-assessor-controls">
                    <section
                        class="sumire-wpvg-assessor-form-section"
                        aria-labelledby="sumire-wpvg-assessor-class-title"
                    >
                        <h2
                            id="sumire-wpvg-assessor-class-title"
                            class="sumire-wpvg-assessor-section-title"
                            ref="assessmentHeading"
                            :tabindex="assessmentHeadingTabIndex"
                            @focus="onAssessmentHeadingFocus"
                        >
                            {{ msg("dialog.class") }}
                        </h2>
                        <cdx-field
                            :is-fieldset="true"
                            :hide-label="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.class")
                            }}</template>
                            <div class="sumire-wpvg-assessor-choice-list">
                                <cdx-radio
                                    v-for="option in classOptions"
                                    :key="option.value"
                                    :model-value="classSelection"
                                    :input-value="option.value"
                                    :disabled="saving || preparing"
                                    :inline="true"
                                    name="className"
                                    @update:model-value="selectClass"
                                    >{{ option.label }}</cdx-radio
                                >
                                <div
                                    class="sumire-wpvg-assessor-custom-class-row"
                                >
                                    <cdx-radio
                                        :model-value="classSelection"
                                        input-value=""
                                        :disabled="saving || preparing"
                                        :inline="true"
                                        name="className"
                                        @update:model-value="selectClass"
                                        >{{
                                            msg("dialog.customClass")
                                        }}</cdx-radio
                                    >
                                    <cdx-text-input
                                        class="sumire-wpvg-assessor-custom-class-input"
                                        :model-value="classInput"
                                        :aria-label="
                                            msg('dialog.customClassValue')
                                        "
                                        :disabled="
                                            saving ||
                                            preparing ||
                                            classSelection !== ''
                                        "
                                        @update:model-value="setClassName"
                                        @blur="commitClassName"
                                    />
                                </div>
                            </div>
                        </cdx-field>
                    </section>
                    <section
                        class="sumire-wpvg-assessor-form-section"
                        aria-labelledby="sumire-wpvg-assessor-projects-title"
                    >
                        <h2
                            id="sumire-wpvg-assessor-projects-title"
                            class="sumire-wpvg-assessor-section-title"
                        >
                            {{ msg("dialog.otherProjects") }}
                        </h2>
                        <cdx-field
                            :is-fieldset="true"
                            :hide-label="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.otherProjects")
                            }}</template>
                            <div class="sumire-wpvg-assessor-check-list">
                                <cdx-checkbox
                                    :model-value="videoGamesSelected"
                                    :inline="true"
                                    :disabled="saving || preparing"
                                    name="videoGamesProject"
                                    @update:model-value="setVideoGamesSelected"
                                    >{{
                                        msg("summary.videoGames")
                                    }}</cdx-checkbox
                                >
                                <cdx-checkbox
                                    v-for="option in otherProjectOptions"
                                    :key="option.id"
                                    :model-value="
                                        assessment.otherProjects[option.id]
                                    "
                                    :disabled="saving || preparing"
                                    :inline="true"
                                    :name="'otherProject-' + option.id"
                                    @update:model-value="
                                        setSelection(
                                            'otherProjects',
                                            option.id,
                                            $event,
                                        )
                                    "
                                    >{{ option.label }}</cdx-checkbox
                                >
                            </div>
                        </cdx-field>
                    </section>
                    <section
                        v-if="videoGamesSelected"
                        class="sumire-wpvg-assessor-form-section sumire-wpvg-assessor-video-games"
                        aria-labelledby="sumire-wpvg-assessor-video-games-title"
                    >
                        <h2
                            id="sumire-wpvg-assessor-video-games-title"
                            class="sumire-wpvg-assessor-section-title"
                        >
                            {{ msg("summary.videoGames") }}
                        </h2>
                        <cdx-field
                            :is-fieldset="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.importance")
                            }}</template>
                            <div class="sumire-wpvg-assessor-choice-list">
                                <cdx-radio
                                    v-for="option in importanceOptions"
                                    :key="option.value"
                                    :model-value="assessment.importance"
                                    :input-value="option.value"
                                    :disabled="saving || preparing"
                                    :inline="true"
                                    name="importance"
                                    @update:model-value="setImportance"
                                    >{{ option.label }}</cdx-radio
                                >
                            </div>
                        </cdx-field>
                        <cdx-field
                            :is-fieldset="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.taskForces")
                            }}</template>
                            <div class="sumire-wpvg-assessor-check-list">
                                <cdx-checkbox
                                    v-for="option in taskForceOptions"
                                    :key="option.id"
                                    :model-value="
                                        assessment.taskForces[option.id]
                                    "
                                    :inline="true"
                                    :disabled="saving || preparing"
                                    :name="'taskForces-' + option.id"
                                    @update:model-value="
                                        setSelection(
                                            'taskForces',
                                            option.id,
                                            $event,
                                        )
                                    "
                                    >{{ option.label }}</cdx-checkbox
                                >
                            </div>
                        </cdx-field>
                        <cdx-field
                            :is-fieldset="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.maintenance")
                            }}</template>
                            <div class="sumire-wpvg-assessor-check-list">
                                <cdx-checkbox
                                    v-for="option in maintenanceOptions"
                                    :key="option.id"
                                    :model-value="
                                        assessment.maintenance[option.id]
                                    "
                                    :inline="true"
                                    :disabled="saving || preparing"
                                    :name="'maintenance-' + option.id"
                                    @update:model-value="
                                        setSelection(
                                            'maintenance',
                                            option.id,
                                            $event,
                                        )
                                    "
                                    >{{ option.label }}</cdx-checkbox
                                >
                            </div>
                        </cdx-field>
                        <cdx-field
                            :is-fieldset="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.newPageList")
                            }}</template>
                            <cdx-message
                                v-if="registrationDisabled"
                                type="notice"
                                :inline="true"
                                >{{ registrationLabel }}</cdx-message
                            >
                            <cdx-checkbox
                                v-else
                                :model-value="shouldRegister"
                                :disabled="saving || preparing"
                                name="registerNewPage"
                                @update:model-value="setRegister"
                                >{{ registrationLabel }}</cdx-checkbox
                            >
                        </cdx-field>
                    </section>
                </div>
                <section
                    class="sumire-wpvg-assessor-form-section sumire-wpvg-assessor-source"
                    aria-labelledby="sumire-wpvg-assessor-review-title"
                >
                    <h2
                        id="sumire-wpvg-assessor-review-title"
                        class="sumire-wpvg-assessor-section-title"
                    >
                        {{ msg("dialog.reviewTalkPage") }}
                    </h2>
                    <cdx-field class="sumire-wpvg-assessor-source-field">
                        <template #label>{{
                            msg("dialog.readySource")
                        }}</template>
                        <cdx-text-area
                            class="sumire-wpvg-assessor-compare-textarea"
                            :model-value="previewText"
                            :readonly="saving || preparing"
                            rows="8"
                            @update:model-value="onPreviewInput"
                        />
                    </cdx-field>

                    <div class="sumire-wpvg-assessor-comparison-field">
                        <h3 class="sumire-wpvg-assessor-field-title">
                            {{ msg("dialog.leadDiff") }}
                        </h3>
                        <p
                            class="sumire-wpvg-assessor-description sumire-wpvg-assessor-comparison-help"
                        >
                            {{ msg("dialog.diffHelp") }}
                        </p>
                        <wikitext-comparison
                            :after-label="msg('dialog.afterSave')"
                            :before-label="msg('dialog.currentSource')"
                            :comparison="talkComparison"
                            :label="msg('dialog.leadDiff')"
                            :no-changes-label="msg('registration.noChanges')"
                        />
                    </div>

                    <cdx-field class="sumire-wpvg-assessor-summary">
                        <template #label>{{
                            msg("dialog.talkSummary")
                        }}</template>
                        <cdx-text-input
                            :model-value="summary"
                            :readonly="saving || preparing"
                            @update:model-value="onSummaryInput"
                        />
                    </cdx-field>
                </section>
            </div>
        </div>
    </cdx-dialog>
    <cdx-dialog
        v-if="!batchEditor"
        :open="batchConfirmOpen && !minimized"
        class="sumire-wpvg-assessor-dialog sumire-wpvg-assessor-batch-dialog"
        :title="msg('dialog.batchConfirmTitle')"
        :lang="interfaceLocale"
        :close-button-label="msg('dialog.batchBack')"
        @update:open="onBatchOpenChange"
    >
        <template #footer>
            <div
                class="sumire-wpvg-assessor-dialog__actions"
                :class="{
                    'sumire-wpvg-assessor-dialog__actions--stacked':
                        stackedActions,
                }"
            >
                <cdx-button weight="quiet" @click="onCollapse">
                    {{ msg("dialog.collapse") }}
                </cdx-button>
                <cdx-button
                    ref="batchBackButton"
                    :disabled="saving || batchRemovingTitle !== ''"
                    @click="onBatchCancel"
                >
                    {{ msg("dialog.batchBack") }}
                </cdx-button>
                <cdx-button
                    action="progressive"
                    weight="primary"
                    :disabled="
                        saving ||
                        preparing ||
                        !batchPrepared ||
                        batchSelectedCount === 0
                    "
                    @click="onConfirmBatch"
                >
                    {{ msg("dialog.batchConfirm") }}
                </cdx-button>
            </div>
        </template>
        <div
            ref="batchContent"
            class="sumire-wpvg-assessor-batch-content"
            role="region"
            tabindex="-1"
            :aria-label="msg('dialog.batchConfirmTitle')"
            :aria-busy="saving || preparing"
        >
            <div
                class="sumire-wpvg-assessor-batch-review"
                :inert="saving || undefined"
                :aria-hidden="saving ? true : undefined"
            >
                <cdx-message v-if="status" :type="statusType">
                    {{ status }}
                </cdx-message>
                <cdx-progress-bar
                    v-if="preparing"
                    :aria-label="msg('dialog.preparingBatch')"
                />
                <div class="sumire-wpvg-assessor-batch-instructions">
                    <p>
                        {{
                            msg("dialog.batchConfirmHelp", {
                                count: batchSelectedCount,
                            })
                        }}
                    </p>
                    <p>{{ msg("dialog.batchUncheckedNotice") }}</p>
                    <p>{{ msg("dialog.batchRateLimit") }}</p>
                    <cdx-message
                        v-if="
                            batchReviewRows.length && batchSelectedCount === 0
                        "
                        type="notice"
                    >
                        {{ msg("dialog.batchNoSelection") }}
                    </cdx-message>
                </div>
                <div class="sumire-wpvg-assessor-batch-table-scroll">
                    <table class="sumire-wpvg-assessor-batch-table">
                        <caption>
                            {{
                                msg("dialog.batchConfirmTitle")
                            }}
                        </caption>
                        <thead>
                            <tr>
                                <th
                                    scope="col"
                                    class="sumire-wpvg-assessor-batch-select"
                                >
                                    <cdx-checkbox
                                        :model-value="batchAllSelected"
                                        :indeterminate="batchPartiallySelected"
                                        :disabled="
                                            saving ||
                                            batchRemovingTitle !== '' ||
                                            batchReviewRows.length === 0
                                        "
                                        @update:model-value="onBatchSelectAll"
                                    >
                                        <span class="sumire-wpvg-assessor-sr">
                                            {{ msg("dialog.batchSelectAll") }}
                                        </span>
                                    </cdx-checkbox>
                                </th>
                                <th scope="col">
                                    {{ msg("dialog.batchPage") }}
                                </th>
                                <th scope="col">
                                    {{ msg("dialog.batchSummary") }}
                                </th>
                                <th scope="col">
                                    {{ msg("dialog.batchChanges") }}
                                </th>
                                <th
                                    scope="col"
                                    class="sumire-wpvg-assessor-batch-actions"
                                >
                                    {{ msg("dialog.batchActions") }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="batchReviewRows.length === 0">
                                <td colspan="5">
                                    {{ msg("dialog.batchEmpty") }}
                                </td>
                            </tr>
                            <tr
                                v-for="row in batchReviewRows"
                                :key="row.title"
                            >
                                <td class="sumire-wpvg-assessor-batch-select">
                                    <cdx-checkbox
                                        :model-value="row.selected"
                                        :disabled="
                                            saving || batchRemovingTitle !== ''
                                        "
                                        @update:model-value="
                                            onBatchSelect(row.title, $event)
                                        "
                                    >
                                        <span class="sumire-wpvg-assessor-sr">
                                            {{
                                                msg(
                                                    "dialog.batchSelectArticle",
                                                    { title: row.title },
                                                )
                                            }}
                                        </span>
                                    </cdx-checkbox>
                                </td>
                                <th scope="row">{{ row.title }}</th>
                                <td>{{ row.changed ? row.summary : "—" }}</td>
                                <td>
                                    <cdx-accordion
                                        v-if="row.changed"
                                        separation="minimal"
                                    >
                                        <template #title>
                                            {{
                                                msg(
                                                    "dialog.batchReviewChanges",
                                                )
                                            }}
                                        </template>
                                        <wikitext-comparison
                                            :after-label="msg('dialog.after')"
                                            :before-label="
                                                msg('dialog.before')
                                            "
                                            :comparison="row.comparison"
                                            :label="row.title"
                                            :no-changes-label="
                                                msg('registration.noChanges')
                                            "
                                        />
                                    </cdx-accordion>
                                    <span v-else>
                                        {{ msg("registration.noChanges") }}
                                    </span>
                                </td>
                                <td class="sumire-wpvg-assessor-batch-actions">
                                    <cdx-button
                                        class="sumire-wpvg-assessor-edit"
                                        weight="quiet"
                                        :disabled="
                                            saving ||
                                            preparing ||
                                            batchRemovingTitle !== ''
                                        "
                                        :aria-label="
                                            msg('dialog.batchEdit', {
                                                title: row.title,
                                            })
                                        "
                                        :title="
                                            msg('dialog.batchEdit', {
                                                title: row.title,
                                            })
                                        "
                                        @click="onBatchEdit(row.title)"
                                    >
                                        <cdx-icon :icon="cdxIconEdit" />
                                    </cdx-button>
                                    <cdx-button
                                        class="sumire-wpvg-assessor-trash"
                                        action="default"
                                        weight="quiet"
                                        :disabled="
                                            saving ||
                                            preparing ||
                                            batchRemovingTitle !== ''
                                        "
                                        :aria-label="
                                            msg('dialog.batchRemove', {
                                                title: row.title,
                                            })
                                        "
                                        :title="
                                            msg('dialog.batchRemove', {
                                                title: row.title,
                                            })
                                        "
                                        @click="onBatchRemove(row.title)"
                                    >
                                        <cdx-icon :icon="cdxIconTrash" />
                                    </cdx-button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div
                v-if="saving"
                class="sumire-wpvg-assessor-batch-overlay"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                <div class="sumire-wpvg-assessor-batch-progress">
                    <strong>{{ msg("dialog.batchSaving") }}</strong>
                    <cdx-progress-bar
                        :value="
                            batchProgress.total > 0
                                ? (batchProgress.completed /
                                      batchProgress.total) *
                                  100
                                : 0
                        "
                        :aria-label="msg('dialog.batchSaving')"
                    />
                    <p>
                        {{
                            msg("dialog.batchProgress", {
                                completed: batchProgress.completed,
                                total: batchProgress.total,
                            })
                        }}
                    </p>
                    <p>{{ batchProgressMessage }}</p>
                </div>
            </div>
        </div>
    </cdx-dialog>
    <section
        v-if="open && minimized && !batchEditor"
        class="sumire-wpvg-assessor-mini"
        role="region"
        :aria-label="msg('dialog.miniMode')"
        :lang="interfaceLocale"
    >
        <div class="sumire-wpvg-assessor-mini__layout">
            <h1
                class="sumire-wpvg-assessor-mini__title"
                ref="miniHeading"
                tabindex="-1"
            >
                {{ dialogTitle }}
            </h1>
            <div class="sumire-wpvg-assessor-mini__body">
                <div
                    v-if="preparing || saving"
                    class="sumire-wpvg-assessor-mini__state"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    <template v-if="saving && batchConfirmOpen">
                        <cdx-progress-bar
                            :value="
                                batchProgress.total > 0
                                    ? (batchProgress.completed /
                                          batchProgress.total) *
                                      100
                                    : 0
                            "
                            :aria-label="msg('dialog.batchSaving')"
                        />
                        <p>
                            {{
                                msg("dialog.batchProgress", {
                                    completed: batchProgress.completed,
                                    total: batchProgress.total,
                                })
                            }}
                        </p>
                        <p>{{ batchProgressMessage }}</p>
                    </template>
                    <template
                        v-if="preparing || (saving && !batchConfirmOpen)"
                    >
                        <cdx-progress-bar
                            :aria-label="status || msg('dialog.saving')"
                        />
                        <p v-if="saving">
                            {{ status || msg("dialog.saving") }}
                        </p>
                    </template>
                </div>
                <cdx-message
                    v-if="status && !saving"
                    class="sumire-wpvg-assessor-mini__message"
                    :type="statusType"
                >
                    {{ status }}
                </cdx-message>
                <cdx-accordion
                    v-if="!saving"
                    separation="minimal"
                    class="sumire-wpvg-assessor-mini__source"
                >
                    <template #title>{{
                        msg("dialog.viewSourceChanges")
                    }}</template>
                    <wikitext-comparison
                        :after-label="msg('dialog.afterSave')"
                        :before-label="msg('dialog.currentSource')"
                        :comparison="talkComparison"
                        :label="msg('dialog.leadDiff')"
                        :no-changes-label="msg('registration.noChanges')"
                        compact
                    />
                </cdx-accordion>
                <div
                    v-if="!saving"
                    class="sumire-wpvg-assessor-mini__form"
                    :aria-busy="preparing"
                >
                    <section
                        class="sumire-wpvg-assessor-form-section"
                        aria-labelledby="sumire-wpvg-assessor-mini-class-title"
                    >
                        <h2
                            id="sumire-wpvg-assessor-mini-class-title"
                            class="sumire-wpvg-assessor-section-title"
                        >
                            {{ msg("dialog.class") }}
                        </h2>
                        <cdx-field
                            :is-fieldset="true"
                            :hide-label="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.class")
                            }}</template>
                            <div class="sumire-wpvg-assessor-choice-list">
                                <cdx-radio
                                    v-for="option in classOptions"
                                    :key="option.value"
                                    :model-value="classSelection"
                                    :input-value="option.value"
                                    :disabled="saving || preparing"
                                    :inline="true"
                                    name="mini-className"
                                    @update:model-value="selectClass"
                                    >{{ option.label }}</cdx-radio
                                >
                                <div
                                    class="sumire-wpvg-assessor-custom-class-row"
                                >
                                    <cdx-radio
                                        :model-value="classSelection"
                                        input-value=""
                                        :disabled="saving || preparing"
                                        :inline="true"
                                        name="mini-className"
                                        @update:model-value="selectClass"
                                        >{{
                                            msg("dialog.customClass")
                                        }}</cdx-radio
                                    >
                                    <cdx-text-input
                                        class="sumire-wpvg-assessor-custom-class-input"
                                        :model-value="classInput"
                                        :aria-label="
                                            msg('dialog.customClassValue')
                                        "
                                        :disabled="
                                            saving ||
                                            preparing ||
                                            classSelection !== ''
                                        "
                                        @update:model-value="setClassName"
                                        @blur="commitClassName"
                                    />
                                </div>
                            </div>
                        </cdx-field>
                    </section>
                    <section
                        class="sumire-wpvg-assessor-form-section"
                        aria-labelledby="sumire-wpvg-assessor-mini-projects-title"
                    >
                        <h2
                            id="sumire-wpvg-assessor-mini-projects-title"
                            class="sumire-wpvg-assessor-section-title"
                        >
                            {{ msg("dialog.otherProjects") }}
                        </h2>
                        <cdx-field
                            :is-fieldset="true"
                            :hide-label="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.otherProjects")
                            }}</template>
                            <div class="sumire-wpvg-assessor-check-list">
                                <cdx-checkbox
                                    :model-value="videoGamesSelected"
                                    :inline="true"
                                    :disabled="saving || preparing"
                                    name="mini-videoGamesProject"
                                    @update:model-value="setVideoGamesSelected"
                                    >{{
                                        msg("summary.videoGames")
                                    }}</cdx-checkbox
                                >
                                <cdx-checkbox
                                    v-for="option in otherProjectOptions"
                                    :key="option.id"
                                    :model-value="
                                        assessment.otherProjects[option.id]
                                    "
                                    :disabled="saving || preparing"
                                    :inline="true"
                                    :name="'mini-otherProject-' + option.id"
                                    @update:model-value="
                                        setSelection(
                                            'otherProjects',
                                            option.id,
                                            $event,
                                        )
                                    "
                                    >{{ option.label }}</cdx-checkbox
                                >
                            </div>
                        </cdx-field>
                    </section>
                    <section
                        v-if="videoGamesSelected"
                        class="sumire-wpvg-assessor-form-section sumire-wpvg-assessor-video-games"
                        aria-labelledby="sumire-wpvg-assessor-mini-video-games-title"
                    >
                        <h2
                            id="sumire-wpvg-assessor-mini-video-games-title"
                            class="sumire-wpvg-assessor-section-title"
                        >
                            {{ msg("summary.videoGames") }}
                        </h2>
                        <cdx-field
                            :is-fieldset="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.importance")
                            }}</template>
                            <div class="sumire-wpvg-assessor-choice-list">
                                <cdx-radio
                                    v-for="option in importanceOptions"
                                    :key="option.value"
                                    :model-value="assessment.importance"
                                    :input-value="option.value"
                                    :disabled="saving || preparing"
                                    :inline="true"
                                    name="mini-importance"
                                    @update:model-value="setImportance"
                                    >{{ option.label }}</cdx-radio
                                >
                            </div>
                        </cdx-field>
                        <cdx-field
                            :is-fieldset="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.taskForces")
                            }}</template>
                            <div class="sumire-wpvg-assessor-mini__choices">
                                <cdx-checkbox
                                    v-for="option in taskForceOptions"
                                    :key="option.id"
                                    :model-value="
                                        assessment.taskForces[option.id]
                                    "
                                    :inline="false"
                                    :disabled="saving || preparing"
                                    :name="'mini-taskForces-' + option.id"
                                    @update:model-value="
                                        setSelection(
                                            'taskForces',
                                            option.id,
                                            $event,
                                        )
                                    "
                                    >{{ option.label }}</cdx-checkbox
                                >
                            </div>
                        </cdx-field>
                        <cdx-field
                            :is-fieldset="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.maintenance")
                            }}</template>
                            <div class="sumire-wpvg-assessor-mini__choices">
                                <cdx-checkbox
                                    v-for="option in maintenanceOptions"
                                    :key="option.id"
                                    :model-value="
                                        assessment.maintenance[option.id]
                                    "
                                    :inline="false"
                                    :disabled="saving || preparing"
                                    :name="'mini-maintenance-' + option.id"
                                    @update:model-value="
                                        setSelection(
                                            'maintenance',
                                            option.id,
                                            $event,
                                        )
                                    "
                                    >{{ option.label }}</cdx-checkbox
                                >
                            </div>
                        </cdx-field>
                        <cdx-field
                            :is-fieldset="true"
                            :disabled="saving || preparing"
                        >
                            <template #label>{{
                                msg("dialog.newPageList")
                            }}</template>
                            <cdx-message
                                v-if="registrationDisabled"
                                type="notice"
                                :inline="true"
                                >{{ registrationLabel }}</cdx-message
                            >
                            <cdx-checkbox
                                v-else
                                :model-value="shouldRegister"
                                :disabled="saving || preparing"
                                name="mini-registerNewPage"
                                @update:model-value="setRegister"
                                >{{ registrationLabel }}</cdx-checkbox
                            >
                        </cdx-field>
                    </section>
                </div>
            </div>
            <div class="sumire-wpvg-assessor-mini__actions">
                <cdx-button
                    v-if="!saving"
                    class="sumire-wpvg-assessor-mini__submit"
                    action="progressive"
                    weight="primary"
                    :disabled="preparing"
                    @click="onMiniSave"
                >
                    {{ submitLabel }}
                </cdx-button>
                <cdx-button :disabled="saving || preparing" @click="onCancel">
                    {{ cancelLabel }}
                </cdx-button>
                <cdx-button ref="miniExpandButton" @click="onExpand">
                    {{ msg("dialog.expand") }}
                </cdx-button>
            </div>
        </div>
    </section>
    <component v-if="batchEditor" :is="batchEditor" />
</template>
