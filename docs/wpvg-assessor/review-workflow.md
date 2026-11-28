# Review workflow

Last reviewed: 2026-11-26.

Open Article Assessor from page tools on Chinese Wikipedia. A staged page
restores its source and summaries. Redirect assessments use the redirect's own
source, creation date, and talk page. Registration uses each page's creation
date and retains existing list entries for explicitly missing pages.

## Assessment and review

Existing banners initialize the controls, including custom classes and
importance values. **Custom** keeps its value when you switch to a preset and
back. `Bplus` and `b+` display as `B+` (乙上 in Chinese).

**Supported WikiProjects** restores existing selections and selects **Video
games** for a new assessment. In both views, the **Video games** section groups
importance, task forces, maintenance, and registration. **Expand** opens
**Preview**.

Clear **Video games** to remove its banner and registration from the draft.
The shared `{{WPBS}}` class and other projects stay editable. Recheck the
project to restore its prior importance. Recognizable source edits also update
the project selection and importance.

Edit the proposed talk-page lead directly or update it through the controls.
The diff shows the exact proposed source. Review banner placement as well as
the assessment changes. See [banner rules](architecture.md#reading-and-preparing-source).

Eligible new pages start with **Register in the Video games new-page list**
selected. Clear it to skip registration. Drafts retain that choice. Registration
requires a recognizable Video games banner in the reviewed source. The tool
prepares the list edit and summary from the selected pages.

## Background drafts and batch submission

The assessment opens in compact mode and stages the initial draft in the local
queue. Edits to the assessment, exact source, summaries, and registration
selection synchronize to that draft after a short delay. Closing the expanded
window or pressing Escape flushes pending changes and retains the draft. Choose
**Don't stage** (**不暂存** in Simplified Chinese) to remove the current page
from the queue and close its form. A storage failure keeps the form open and
displays the error.

Drafts persist by wiki and account. **View source changes** opens the diff.
**Expand** and **Collapse** switch views of the same draft.

**Next** stages the latest form and prepares **Confirm batch save**. The
**(+N)** count shows other queued pages. Review the diff and exact summary for
each page, then check the pages to save. Unchecked drafts stay queued. Use the
pencil to edit a draft, **Apply changes** to update it, or **Cancel** to keep
the queued draft. Removing a queued draft preserves edits in the open form.
**Back** keeps your edits. If the queue changes, choose **Next** for a fresh
review.

**Confirm and save** validates the reviewed queue, writes registration once,
then saves the checked talk pages with
[cross-tab pacing](architecture.md#review-storage-and-writes). The form
reports progress and retains unfinished pages after a failure. Reopen review
after a conflict or uncertain outcome.

The registration summary combines the added pages in English. The automatic
summary fits 255 UTF-8 bytes by preferring article links and counting other
pages if needed. Custom draft summaries keep their text and take priority.

See the [queue and write contract](architecture.md#review-storage-and-writes).

### Clear local storage

Copy any queued source and summaries you want to keep. Finish active saves,
close open assessment dialogs, and close the other Article Assessor tabs. With
the updated script loaded on the wiki, run this command in the browser's
developer console.

```js
await window[Symbol.for("sumire.wpvg-assessor.clear-local-storage")]();
```

The command deletes all Article Assessor queues, creation-date cache entries,
and edit-pacing records in `localStorage` for the current wiki origin. It covers
all accounts on that origin and returns the number of removed records.

## Category assessment

![Category article preview and assessment actions](<images/category assessment (zh-Hant).png>)

See the [image inventory](images/README.md) for the captured article, revision,
and portrait credits.

On the unassessed Video games category, the page-tool action becomes
**Batch assess articles (批量评级条目)**. The category interface uses a nearly
full-screen sandboxed frame to show the rendered article. Below it, one Codex
action row groups [Stub | Start | D | C | B], [SL | List | CL | BL], and
[Unassessed | Skip]. Article source and proposed talk-page source remain text
in assessment controls and comparisons.

The sandboxed preview uses the wiki's styles and the article's
[TemplateStyles](https://www.mediawiki.org/wiki/Help:TemplateStyles). See
[category workflow behavior](architecture.md#category-and-archive-workflows).

Expand **Review proposed talk-page lead** to inspect the proposed source and
edit its talk-page summary before acting. Choosing a class button applies
that class, generates the corresponding lead through the ordinary assessment
rules, and starts saving the captured lead and summary in the background
while advancing immediately. Other assessment flags and a manually entered
summary are preserved. Category saves write only to talk pages and use the
[same conflict handling](#conflicts-and-failures).

A failed or uncertain save queues that article after the remaining category
pages. When it returns, the interface restores the captured exact source and
summary and shows the save error. Choose a class again to start another save.
At the end of the category, the interface shows the number of pending
background saves, and failed articles appear as those saves settle.

**Skip** leaves the current assessment as it is and advances. **Cancel** closes
the interface during reading and loading and discards late UI results.
Background saves continue after closing. Reopen the form in the same tab before
reloading to recover failed reviews from memory. If an article fails to load,
choose **Retry** to load it again.

## New-page-list archiving

On `WikiProject:电子游戏/新进条目`, the page-tool entry is **Archive tool**
(**存档工具** / **存檔工具**). It opens an archive review for that list page.
The tool archives whole months and keeps the current and previous UTC months
in the list. Daily blocks marked `無新條目` are eligible.

Eligible blocks are grouped by year into
`WikiProject:电子游戏/新进条目/YYYY年存档`. Annual pages use `==YYYY年==` and
`===M月===` sections, with months and days in descending order. New records merge
into the corresponding month sections while retaining existing archive content.
Within those blocks, safely recognizable `{{Vgc|Title}}`
calls become ordinary `[[:Title]]` links, with case-insensitive template names.
Dykico markers, namespace groups, and other record content are retained.
Source-page introductory text, recent records, and footer content remain in place.
Ambiguous template parameters or conflicting existing archived records stop preparation.

The dialog shows read-only previews of the exact retained list source and the
complete proposed source for each annual destination, including any existing
archive content. Review every page and its edit summary, then choose **Archive**
to publish or **Cancel** to dismiss the preview.

Before the first write, the tool refetches all reviewed pages and checks their
source, revision IDs, and base timestamps. It saves the annual destinations in
sequence and attempts source-record removal once each destination already has
the proposed source or its save is confirmed. The progress view stays open
until the save finishes. See the [write preconditions](architecture.md#whole-page-writes).

A conflict, stale preview, failed save, or uncertain save stops the sequence.
The dialog reports confirmed destination saves. Choose **Reload preview** and
review the latest pages before continuing. A fresh preview skips dated blocks
already saved with identical content. Resolve differences for the same date
before archiving.

## Conflicts and failures

Registration stops if the list has changed since review or the reviewed
snapshot lacks a valid revision ID. Reopen the review to read the current list.
See the [write preconditions](architecture.md#whole-page-writes).

Talk-page saves refetch the latest page and replace its lead with the reviewed
lead while retaining the discussion body. A confirmed `editconflict` allows a
retry, for up to three total attempts. Each attempt fetches the page again.
Network errors and other uncertain results stop the save and remain visible.

Existing pages require readable revision content and a base timestamp. A
missing or hidden revision stops the workflow. A save requires an explicit
successful edit response from MediaWiki.

Registration and talk-page assessment are separate wiki edits. If registration
succeeds and the talk edit fails, registration remains saved. Inspect the
latest wiki state before retrying; reopening reads the current state.
