# Article Assessor screenshots

Last reviewed: 2026-11-26.

| Screenshot                                                 | View                                                                | Source                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Full assessment](<full assessment (en).png>)              | Expanded form with the proposed source and summary.                 | [EliGE, revision 95764456][article] and [Talk:EliGE, revision 95749921][talk]. |
| [Mini assessment](<mini assessment (zh-Hans).png>)         | Bordered compact panel with **View source changes** open.           | The same EliGE article and talk page.                                          |
| [Category assessment](<category assessment (zh-Hant).png>) | The first unassessed article, its contents list, and class actions. | [Unassessed video-game articles, revision 80842948][category].                 |

## Capture

```sh
npm run build
node scripts/wpvg-assessor/capture-live.mjs
```

Chromium uses live Chinese Wikipedia and the wiki's actual modules and API
reads. The starting viewport is 1366 × 768, DPR 1. Full and category views
use a taller viewport where needed for review controls. The script dismisses
native variant and site notices. It opens the diff for a staged class change and submits no wiki edits.

Use `--locales=en,zh-Hans` to retry the two article views. The
[capture ledger](live-captures.json) records exact dimensions, captures, and
checksums. Offline browser fixtures and screenshot tests are separate.
Existing ledger entries identify the Kanade bundle used for those captures.

## Attribution

The [article][article-history], [talk page][talk-history], and
[category][category-history] are by Chinese Wikipedia contributors under
[CC BY-SA 4.0][article-license]. [Elige.png][portrait] is by BLAST Premier
under [CC BY 3.0][photo-license].
[Third-party notices](../../../THIRD-PARTY-NOTICES.md) credits other fixtures.

[article]: https://zh.wikipedia.org/w/index.php?oldid=95764456
[talk]: https://zh.wikipedia.org/w/index.php?oldid=95749921
[category]: https://zh.wikipedia.org/w/index.php?oldid=80842948
[article-history]: https://zh.wikipedia.org/w/index.php?title=EliGE&action=history
[talk-history]: https://zh.wikipedia.org/w/index.php?title=Talk:EliGE&action=history
[category-history]: https://zh.wikipedia.org/w/index.php?title=Category:未评级电子游戏条目&action=history
[article-license]: https://creativecommons.org/licenses/by-sa/4.0/
[portrait]: https://commons.wikimedia.org/wiki/File:Elige.png
[photo-license]: https://creativecommons.org/licenses/by/3.0/
