export const contributionDialogStyles = `
.cdx-dialog.sumire-contrib {
    --contrib-border: var(--border-color-subtle, rgba(114, 119, 125, .3));
    --contrib-muted: var(--color-subtle, currentColor);
    --contrib-accent: var(--color-progressive, #36c);
    --contrib-selected: var(--background-color-progressive-subtle, rgba(51, 102, 204, .12));
    width: min(56rem, calc(100% - 2rem));
    max-width: 56rem;
}

.cdx-dialog.sumire-contrib--short {
    width: min(32rem, calc(100% - 2rem));
}

.cdx-dialog.sumire-contrib--editor:not(.sumire-contrib--short) {
    height: min(46rem, calc(100vh - 2rem));
    height: min(46rem, calc(100dvh - 2rem));
}

.sumire-contrib .contrib-workspace {
    display: grid;
    grid-template-columns: minmax(13.5rem, .85fr) minmax(0, 1.35fr);
    gap: var(--spacing-150, 1.5rem);
    align-items: start;
    padding-top: var(--spacing-100, 1rem);
}

.sumire-contrib .contrib-navigation {
    position: sticky;
    top: 0;
    min-width: 0;
}

.sumire-contrib .contrib-navigation .cdx-accordion__content {
    padding-inline: 0;
}

.sumire-contrib .contrib-list-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-75, .75rem);
}

.sumire-contrib .contrib-list-controls .cdx-text-input {
    flex: 1 1 7rem;
    min-width: 0;
}

.sumire-contrib .contrib-list-controls .cdx-button {
    flex: none;
}

.sumire-contrib .contrib-list {
    max-height: min(49vh, 29rem);
    margin: .75rem 0 0;
    padding: 0;
    overflow: auto;
    border: 1px solid var(--contrib-border);
    border-radius: 2px;
    list-style: none;
}

.sumire-contrib .contrib-list li {
    margin: 0;
}

.sumire-contrib .contrib-list li + li {
    border-top: 1px solid var(--contrib-border);
}

.sumire-contrib .contrib-list .contrib-entry-choice {
    display: block;
    width: 100%;
    height: auto;
    padding: .5rem .65rem;
    border-radius: 0;
    text-align: start;
    font-weight: var(--font-weight-normal, 400);
    white-space: normal;
    overflow-wrap: anywhere;
}

.sumire-contrib .contrib-list .contrib-entry-choice[aria-pressed="true"] {
    border-inline-start: 3px solid var(--contrib-accent);
    background: var(--contrib-selected);
    padding-inline-start: calc(.65rem - 2px);
}

.sumire-contrib .contrib-chip {
    margin-inline-start: var(--spacing-25, .25rem);
    vertical-align: middle;
    line-height: 1.25rem;
}

.sumire-contrib .contrib-chip .cdx-info-chip__text {
    font-size: .75rem;
}

.sumire-contrib .contrib-help {
    color: var(--contrib-muted);
    font-size: .8125rem;
    font-weight: 400;
}

.sumire-contrib .contrib-editor {
    min-width: 0;
}

.sumire-contrib .contrib-fieldset {
    min-inline-size: 0;
    margin: 0;
    padding: var(--spacing-75, .75rem);
    border: 1px solid var(--border-color-muted, var(--contrib-border));
    border-radius: var(--border-radius-base, 2px);
}

.sumire-contrib .contrib-fieldset > legend {
    padding-inline: var(--spacing-25, .25rem);
    font-weight: var(--font-weight-bold, 700);
}

.sumire-contrib .contrib-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--spacing-100, 1rem);
}

.sumire-contrib .contrib-fields .cdx-field {
    min-width: 0;
    margin: 0;
}

.sumire-contrib .contrib-fields :is(.cdx-text-input, .cdx-combobox, .cdx-text-area),
.sumire-contrib .contrib-edit-summary .cdx-text-area {
    width: 100%;
    min-width: 0;
}

.sumire-contrib .contrib-translation-authors .cdx-text-area__textarea[rows="1"] {
    min-height: 0;
}

.sumire-contrib .contrib-notes {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--spacing-150, 1.5rem);
    margin-top: var(--spacing-150, 1.5rem);
}

.sumire-contrib .contrib-add-note-button {
    justify-self: start;
}

.sumire-contrib .contrib-note-actions,
.sumire-contrib .contrib-entry-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-75, .75rem);
}

.sumire-contrib .contrib-entry-actions {
    margin-top: var(--spacing-150, 1.5rem);
    padding-top: var(--spacing-100, 1rem);
    border-top: 1px solid var(--contrib-border);
}

.sumire-contrib .contrib-entry-actions .cdx-message {
    width: 100%;
}

.sumire-contrib .contrib-item-preview {
    margin-block-start: var(--spacing-150, 1.5rem);
}

.sumire-contrib .contrib-item-preview-title {
    margin-block: 0 var(--spacing-50, .5rem);
    font-weight: var(--font-weight-bold, 700);
}

.sumire-contrib .contrib-item-preview-body {
    box-sizing: border-box;
    min-block-size: 7rem;
    border: 1px solid var(--contrib-border);
    border-radius: var(--border-radius-base, 2px);
}

.sumire-contrib .contrib-item-preview-frame {
    display: block;
    width: 100%;
    height: 7rem;
    border: 0;
}

.sumire-contrib .contrib-item-preview-status {
    padding: var(--spacing-75, .75rem);
    margin: 0;
    color: var(--contrib-muted);
}

.sumire-contrib .contrib-item-preview-source {
    margin-block-start: var(--spacing-75, .75rem);
}

.sumire-contrib .contrib-item-preview-source p {
    margin-block: 0 var(--spacing-25, .25rem);
}

.sumire-contrib .contrib-item-preview-source pre {
    max-block-size: 10rem;
    margin: 0;
    padding: var(--spacing-75, .75rem);
    overflow: auto;
    border: 1px solid var(--contrib-border);
    border-radius: var(--border-radius-base, 2px);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.sumire-contrib .contrib-request-error {
    margin-bottom: 1rem;
}

.sumire-contrib .contrib-unavailable {
    margin-top: var(--spacing-100, 1rem);
}

.sumire-contrib .contrib-revision-link {
    margin-bottom: 0;
}

.sumire-contrib .contrib-footer,
.sumire-contrib .contrib-footer-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-75, .75rem);
}

.sumire-contrib .contrib-footer {
    width: 100%;
    justify-content: space-between;
}

.sumire-contrib .contrib-footer-actions {
    margin-inline-start: auto;
}

.sumire-contrib .contrib-preview-footer {
    display: grid;
    gap: var(--spacing-100, 1rem);
}

.sumire-contrib .contrib-preview-frame {
    display: block;
    width: 100%;
    height: min(66vh, 44rem);
    box-sizing: border-box;
    border: 1px solid var(--contrib-border);
}

@media (min-width: 640px) and (min-height: 360px) {
    @supports selector(::details-content) {
        .sumire-contrib--contributions :is(.cdx-dialog__body, .cdx-tabs, .cdx-tabs__content, .cdx-tab) {
            display: flex;
            flex: 1;
            flex-direction: column;
            min-block-size: 0;
        }

        .sumire-contrib--contributions .cdx-dialog__body {
            overflow: hidden;
        }

        .sumire-contrib--contributions .contrib-workspace {
            flex: 1;
            min-block-size: 0;
            grid-template-rows: minmax(0, 1fr);
            align-items: stretch;
        }

        .sumire-contrib--contributions .contrib-navigation {
            position: static;
            display: flex;
            flex-direction: column;
            overflow: auto;
        }

        .sumire-contrib--contributions :is(.cdx-accordion:not([open]), summary, .contrib-list-controls) {
            flex: none;
        }

        .sumire-contrib--contributions .cdx-accordion[open],
        .sumire-contrib--contributions .cdx-accordion[open]::details-content,
        .sumire-contrib--contributions .cdx-accordion__content {
            display: flex;
            flex-direction: column;
            min-block-size: 0;
        }

        .sumire-contrib--contributions :is(.cdx-accordion__content, .contrib-editor) {
            overflow: auto;
        }

        .sumire-contrib--contributions .contrib-list {
            min-block-size: 2rem;
            max-height: none;
        }

        @media (max-height: 520px) {
            .sumire-contrib--contributions :is(.cdx-dialog__header, .cdx-dialog__footer) {
                padding-block: var(--spacing-50, .5rem);
            }

            .sumire-contrib--contributions :is(.cdx-accordion > summary, .cdx-accordion__content) {
                padding-block: var(--spacing-25, .25rem);
            }

            .sumire-contrib--contributions .contrib-list {
                margin-block-start: var(--spacing-50, .5rem);
            }
        }
    }
}

@media (max-width: 639px) {
    .sumire-contrib .contrib-workspace {
        grid-template-columns: minmax(0, 1fr);
    }
    .sumire-contrib .contrib-navigation {
        position: static;
    }
    .sumire-contrib .contrib-list {
        max-height: 11rem;
    }
}

@media (max-width: 480px) {
    .cdx-dialog.sumire-contrib,
    .cdx-dialog.sumire-contrib--short {
        width: 100%;
    }
}
`;
