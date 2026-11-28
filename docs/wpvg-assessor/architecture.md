# Article Assessor architecture

Last reviewed: 2026-11-23.

Article Assessor reviews assessment and new-page-list changes on Chinese
Wikipedia. See [review workflow](review-workflow.md) for the editor's steps.

## Folder names and ownership

| Source path under `src/wpvg-assessor/` | Responsibility                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `app/`                                 | Startup, workflow composition, read preparation, review, and confirmed saves.   |
| `domain/`                              | Lossless banner updates, comparisons, registration, archiving, and title rules. |
| `platform/mediawiki/`                  | Host title handling, API requests, and category reads.                          |
| `platform/mediawiki/page-metadata.ts`  | Subject metadata and cached creation-time lookups.                              |
| `platform/mediawiki/page-source/`      | Review snapshots and protected edits for talk pages, the list, and archives.    |
| `platform/browser/`                    | Queues, locks, snapshots, and preview styles.                                   |
| `features/assessment/`                 | Compact, full, category, and confirmation interfaces.                           |
| `features/archive/`                    | Archive previews, progress, and recovery.                                       |
| `index.ts`                             | Pure assessment, registration, and comparison exports.                          |

`src/entries/wpvg-assessor.ts` starts `app/browser.ts`, which establishes
eligibility and reaches the MediaWiki host through the Sumire startup helper.
`app/main.ts` supplies adapters and workflows to `app/interface.ts`.
Features consume injected operations. Support code under the tool directory
owns the title catalog, source-preserving scanner, localization, and host adapters
used by Article Assessor. Follow the [Sumire workflows](../workflows.md).

## Dependencies and startup

Native page tools open the interface appropriate to an article, the unassessed
category, or the exact new-page list. After normal wiki and page checks,
`wpvg-assessor=1` opens the same interface and is consumed once. Cleanup preserves
the other URL parameters, fragment, and host history state.

`app/source-links-browser.ts` decorates eligible result links on supported
PetScan hosts and the Chinese Wikipedia new-page list. PetScan startup ends
after decoration. Browser listeners and DOM observers follow the current
document and preserve native and modified clicks. The launch marker opens the
tool without submitting an edit.

## Reading and preparing source

The shared revision query reads formatversion 2 page arrays and requires the
query timestamp. Existing-page snapshots require a base timestamp and readable
main-slot source. An explicitly missing talk or archive page returns empty
source with the query timestamp. The combined assessment read shares one query
timestamp across the talk page and list. See [MediaWiki's revisions API][revisions-api].

Subject metadata and creation time describe the requested page itself,
including redirects. Namespace classification uses the shared Chinese Wikipedia
title policy. Registration captures the exact reviewed list revision ID.

The wikitext scanner protects links, comments, and opaque regions. Ordinary
assessment drafts order recognized top-level banners in the opening header
according to the [Chinese Wikipedia layout guide][talk-page-layout]. Notices
and history precede the project shell. Requests, attribution, and archive
banners follow it. Equal-ranked banners retain their source order. Sorting
replaces known banner slots and preserves unknown templates, separators, and
the source beyond the leading header or DYK archive. Nested project order
stays within the shell. Recognized history includes [Old vfd multi][old-vfd-history],
[Multidel][multidel-history], and [Drv-kept][drv-history].

Registration and batch preparation share a validated log snapshot for up to
one minute. An attempted write invalidates it. Whole-list writes recheck the
reviewed revision. Archive preparation and validation use fresh reads.

## Assessment form presentation

Compact and expanded assessments share one draft. Turning off Video games maps
to `NotVG` and retains the prior importance for toggling back. Draft removal
waits for pending synchronization. Queue or storage errors keep the form open.
See [assessment and review](review-workflow.md#assessment-and-review).

## Review, storage, and writes

Queue mutations and submissions hold an exclusive Web Lock scoped by wiki and
account. Recheck the reviewed queue fingerprint under that lock. Selection
changes invalidate stale preparation. The persistent queue is the draft
authority. Read snapshots stay in tab storage. The current format pools shared log
source. A quota retry may reclaim the creation-date cache. See the
[storage inventory](#storage-inventory) and
[reset procedure](review-workflow.md#clear-local-storage).

### Storage inventory

| Record         | Key and retention                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staged reviews | Local `sumire.wpvg-assessor.assessment-queue.v1:<encoded wiki/account identity>`. Closing retains work. Confirmed saves clear completed drafts.                            |
| Read snapshots | Session `sumire.wpvg-assessor.assessment-cache.v1:<encoded wiki/account identity>`. Ends with the tab session. Recent list results serve preparation for up to one minute. |
| Creation dates | Local `sumire.wpvg-assessor.creation-datetimes.v1`. Holds up to 2,048 entries and can be reclaimed when storage is full.                                                   |
| Edit pacing    | Local `sumire.wpvg-assessor.next-edit.v1:<encoded wiki/account identity>`. Holds the earliest allowed time for the next edit.                                              |

The batch workflow in `app/save-assessment.ts` writes registration first,
uses `app/save-talk-assessment.ts` for each changed lead, and clears finished
drafts. Category submissions use the same talk-page save workflow. Edit
requests, including retries, start at least six seconds after the previous
request finishes. A validated pacing timestamp coordinates tabs. If writing
it fails, the lock stays held through the remaining interval.

Default edit summaries use English. Preserve custom summaries and send the
reviewed talk-page summary with the confirmed write. The
[batch workflow](review-workflow.md#background-drafts-and-batch-submission)
describes how registration summaries are combined.

### Whole-page writes

Registration and archive reviews record the page source and query timestamp.
Existing pages also require a base timestamp and revision ID. The new-page
list adapter requires that revision ID when reading the source.

Registration and edits to existing archive pages send the reviewed revision ID
as `baserevid` with `nocreate`. They omit `basetimestamp` so that revision
conflicts from the same account also stop the write. A reviewed missing archive
uses `createonly`, which fails if the destination has appeared. These writes
send the query timestamp as `starttimestamp` and require MediaWiki to return a
successful edit result. See [MediaWiki's edit API][edit-api].

## Category and archive workflows

Category assessment preloads the current article and next three articles.
It reads talk-page leads and shows rendered article content in a sandboxed
preview. The browser adapter serializes same-origin host styles in cascade
order and passes them to the dialog with their allowed origin through
`CategoryArticleStyles`. Both use the same HTML escaping for stylesheet
attributes and reader text. Inline stylesheet content uses separate CSS
escaping. On wide screens, a contents list to the left links to the article
headings. The reading frame is capped at 960px and the article at 948px including
padding. Class selection captures the exact proposed lead and summary, starts a
protected write, and advances. Failures remain in the tab for explicit retry.
Closing frees the interface while pending saves finish.

Archiving keeps the current and previous UTC months in the source list.
It groups older daily records in annual archives and preserves source order
and line endings within records. Verify all reviewed page revisions before
saving and use create-only writes for new archives. Write destinations first,
then remove confirmed source records. On partial failure, a fresh review
recognizes already saved dates.

## Build and verification

Sumire's build embeds templates and scoped styles in the standalone and
aggregate scripts. Tests cover exact prepared drafts, conflict and quota
recovery, queue locks, protected writes, and compact and expanded interfaces.
See [Sumire workflows](../workflows.md#distribution) and the
[live image inventory](images/README.md).

[talk-page-layout]: https://zh.wikipedia.org/w/index.php?title=Wikipedia:讨论页版面布局&oldid=95581636
[old-vfd-history]: https://zh.wikipedia.org/wiki/Template:Old_vfd_multi/doc
[multidel-history]: https://zh.wikipedia.org/wiki/Template:Multidel/doc
[drv-history]: https://zh.wikipedia.org/wiki/Template:Drv-kept/doc
[revisions-api]: https://www.mediawiki.org/wiki/API:Revisions
[edit-api]: https://www.mediawiki.org/wiki/API:Edit
