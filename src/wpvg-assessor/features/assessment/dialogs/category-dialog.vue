<!--
@file src/wpvg-assessor/features/assessment/dialogs/category-dialog.vue
Purpose: src / features / assessment / dialogs / category dialog module.

Table of contents:
1. Template
-->

<template>
    <cdx-dialog
        v-model:open="batchOpen"
        class="sumire-wpvg-assessor-category-dialog"
        :class="{
            'sumire-wpvg-assessor-category-dialog--with-contents':
                batchDocument?.hasContents,
        }"
        :style="{
            '--sumire-wpvg-assessor-category-preview-width': articleFrameWidth,
        }"
        :title="msg('batch.title')"
        :lang="interfaceLocale"
        :close-button-label="msg('dialog.cancel')"
        :fixed-height="true"
        @update:open="onBatchOpenChange"
    >
        <div class="sumire-wpvg-assessor-category-body" :aria-busy="batchBusy">
            <div
                class="sumire-wpvg-assessor-category-status"
                aria-live="polite"
                aria-atomic="true"
            >
                <cdx-message v-if="batchError" type="error">{{
                    batchError
                }}</cdx-message>
                <cdx-progress-bar
                    v-if="batchBusy"
                    :aria-label="msg('batch.loading')"
                />
            </div>
            <template v-if="batchArticle">
                <div class="sumire-wpvg-assessor-category-article">
                    <h2 class="sumire-wpvg-assessor-category-title">
                        {{ batchArticleLabel }}
                    </h2>
                    <iframe
                        :key="batchArticle.state.talkTitle"
                        class="sumire-wpvg-assessor-category-preview"
                        :title="msg('batch.articlePreview')"
                        sandbox=""
                        referrerpolicy="no-referrer"
                        :srcdoc="batchDocument?.html"
                    ></iframe>
                </div>
                <div class="sumire-wpvg-assessor-category-form">
                    <cdx-field :is-fieldset="true" :disabled="batchBusy">
                        <template #label>{{ msg("batch.class") }}</template>
                        <div class="sumire-wpvg-assessor-category-ratings">
                            <cdx-button-group
                                v-for="(buttons, index) in batchButtonGroups"
                                :key="index"
                                class="sumire-wpvg-assessor-category-rating-group"
                                :buttons="buttons"
                                :aria-label="
                                    buttons
                                        .map((button) => button.label)
                                        .join(', ')
                                "
                                :disabled="batchBusy"
                                @click="onBatchAction"
                            />
                        </div>
                    </cdx-field>
                    <cdx-accordion
                        class="sumire-wpvg-assessor-category-review"
                        separation="minimal"
                    >
                        <template #title>{{
                            msg("batch.reviewLead")
                        }}</template>
                        <div
                            class="sumire-wpvg-assessor-category-review-content"
                        >
                            <pre>{{ batchPreview }}</pre>
                            <cdx-field :disabled="batchBusy">
                                <template #label>{{
                                    msg("dialog.talkSummary")
                                }}</template>
                                <cdx-text-input
                                    :model-value="batchSummary"
                                    :disabled="batchBusy"
                                    @update:model-value="setBatchSummary"
                                />
                            </cdx-field>
                        </div>
                    </cdx-accordion>
                </div>
            </template>
            <cdx-message v-else-if="!batchBusy && !batchError" type="notice">{{
                batchPendingSaves > 0
                    ? msg("batch.pendingSaves", { count: batchPendingSaves })
                    : batchFinished
                      ? msg("batch.finished")
                      : msg("batch.empty")
            }}</cdx-message>
        </div>
        <template #footer>
            <div class="sumire-wpvg-assessor-category-footer">
                <p class="cdx-dialog__footer__text">
                    {{ msg("batch.help") }}
                </p>
                <p
                    v-if="batchArticle && batchPendingSaves > 0"
                    class="cdx-dialog__footer__text"
                    role="status"
                >
                    {{
                        msg("batch.pendingSaves", { count: batchPendingSaves })
                    }}
                </p>
                <div class="sumire-wpvg-assessor-category-actions">
                    <cdx-button
                        action="default"
                        weight="quiet"
                        @click="onBatchCancel"
                        >{{ msg("dialog.cancel") }}</cdx-button
                    >
                    <cdx-button
                        v-if="batchError && !batchArticle"
                        action="progressive"
                        weight="primary"
                        :disabled="batchBusy"
                        @click="onBatchRetry"
                        >{{ msg("batch.retry") }}</cdx-button
                    >
                </div>
            </div>
        </template>
    </cdx-dialog>
</template>
