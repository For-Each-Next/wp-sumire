# Article Assessor

Last reviewed: 2026-11-22.

Article Assessor prepares video-game article assessments, new-page
registrations, and archive edits on Chinese Wikipedia.

## Features

- Stage article assessments and review selected drafts together.
- Browse unassessed articles with a preview and immediate class actions.
- Register eligible new pages and archive whole months.

## Install and open

Install Sumire or the standalone `wpvg-assessor.user.js` or `wpvg-assessor.min.js`
using the [installation guide](../../README.md#install-and-use). Choose
**Article Assessor** in page tools on a desktop Chinese Wikipedia article or
talk page. When installed in a userscript manager, supported PetScan results can
open Article Assessor on the wiki.

## Use

Ordinary assessments open in Mini mode and stage the current draft locally.
Choose **View source changes** to inspect the talk-page diff in place. Choose
**Expand** for the full source comparison and edit summary. Closing retains the
draft. **Don't stage** removes the current draft from the queue.

Choose **Next** to open batch confirmation, even for one page. Check the drafts
to submit, review their changes, then choose **Confirm and save**. Unchecked
drafts remain queued. Eligible new pages can also be registered.

On the unassessed category, choose **Batch assess articles**. On wide screens,
use **Contents** beside the preview to jump to an article section. **Choosing a
class saves immediately and advances.** **Skip** advances without saving. Failed
reviews stay in the current tab for retry.

On `WikiProject:电子游戏/新进条目`, open **Archive tool** and review the retained
list and annual destinations before choosing **Archive**. Use **Reload preview**
to review the current state after a stopped save.

| Full assessment                                                         | Mini assessment with the diff open                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Full assessment and source review](<images/full assessment (en).png>) | ![Mini assessment and proposed source](<images/mini assessment (zh-Hans).png>) |

The screenshots use [EliGE, revision 95764456][article] and
[Talk:EliGE, revision 95749921][talk] by the [article][article-history] and
[talk-page][talk-history] contributors under [CC BY-SA 4.0][article-license].
[The EliGE portrait][portrait] is by BLAST Premier under [CC BY 3.0][photo-license].
See the [image inventory](images/README.md) for the category view and exact captures.

## Reference

- [Review workflow](review-workflow.md) and
  [local storage reset](review-workflow.md#clear-local-storage).
- [Architecture](architecture.md) and [storage inventory](architecture.md#storage-inventory).

[article]: https://zh.wikipedia.org/w/index.php?oldid=95764456
[talk]: https://zh.wikipedia.org/w/index.php?oldid=95749921
[article-history]: https://zh.wikipedia.org/w/index.php?title=EliGE&action=history
[talk-history]: https://zh.wikipedia.org/w/index.php?title=Talk:EliGE&action=history
[article-license]: https://creativecommons.org/licenses/by-sa/4.0/
[portrait]: https://commons.wikimedia.org/wiki/File:Elige.png
[photo-license]: https://creativecommons.org/licenses/by/3.0/
