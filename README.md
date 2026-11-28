# Sumire

Sumire prepares attributed draft copies and video game assessments on Chinese
Wikipedia, edits the owner's global user profile, and labels game reviews
with Wikipedia source classifications.

## Tools

| Tool                                             | What it does                                                                                        | Userscript                                                  | Minified script                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| [Draft Copy](#draft-copy)                        | Copy articles to drafts and prepare attributed edits to publish drafts on Chinese Wikipedia.        | [draft-copy.user.js][draft-copy-userscript]                 | [draft-copy.min.js][draft-copy-wiki-script]                 |
| [Meta Profile Editor](#meta-profile-editor)      | Edit contributions, barnstars, quotations, and userboxes on the global user profile.                | [meta-contributions.user.js][meta-contributions-userscript] | [meta-contributions.min.js][meta-contributions-wiki-script] |
| [Article Assessor](docs/wpvg-assessor/README.md) | Assess video game articles, register new pages, and archive the new-page list on Chinese Wikipedia. | [wpvg-assessor.user.js][wpvg-assessor-userscript]           | [wpvg-assessor.min.js][wpvg-assessor-wiki-script]           |
| [WPVG Source Labels](#wpvg-source-labels)        | Label reviews on Metacritic and OpenCritic with WikiProject Video games source classifications.     | [wpvg-source-labels.user.js][wpvg-source-labels-userscript] | [wpvg-source-labels.min.js][wpvg-source-labels-minified]    |

The wiki tools support English, Simplified Chinese, and Traditional Chinese.
Article Assessor also supports Japanese and Russian. WPVG Source Labels uses
Traditional Chinese.

## Install and use

Both [sumire.user.js][sumire-userscript] and [sumire.min.js][sumire-wiki-script]
include all four tools. Choose the aggregate or individual tool scripts
for each installation.

- **Userscript manager.** Import the `.user.js` file into Tampermonkey.
  For a minified installation on review sites, paste the complete
  `sumire.min.js` or `wpvg-source-labels.min.js` file into its script editor.
- **Wiki account.** For wiki tools, paste the complete `.min.js` file into
  `Special:MyPage/common.js` on the wiki or `Special:MyPage/global.js` on
  Meta-Wiki.

The standalone Source Labels userscript keeps its existing Tampermonkey
storage. The aggregate has its own Source Labels settings and refreshes its
cache on first use.

### Draft Copy

On an article on Chinese Wikipedia, choose **Copy to draft** from the page
actions menu. On a draft, choose **Publish draft**. Sumire prepares a native
preview or diff for the matching title. Review and save the proposed edit
in the wiki editor.

### Meta Profile Editor

Sign in as `For Each ... Next` and open the [global user page][profile].
Choose **Edit contributions** on Meta-Wiki or **Edit profile** on a wiki
displaying that page. The contribution editor can prefill fields from a
title, wikilink, or URL and move ongoing entries to **Articles** or
**Reviews**. Each item has a wikitext and rendered preview. Use the
**Barnstars**, **Quotations**, and **Userboxes** tabs for other records.

Review the changed sections and edit summary before choosing **Save on
Meta-Wiki**.

### WPVG Source Labels

Open a game's critic-review list on Metacritic or OpenCritic. Choose a
WPVG label to inspect the matching evidence, source notes, and links to
the cited Wikipedia revision. The dialog identifies ambiguous matches and
date-dependent classifications. Use the WPVG menu to refresh the
[source table][sources] or hide unmatched labels.

## Build and verify

Use Node.js 26 and npm 11. Run these commands from the repository root.

```sh
npm ci
npx playwright install chromium
npm run verify
```

See the [workflow guide](docs/workflows.md) for validation ownership,
distribution, and release preparation. See the [changelog](CHANGELOG.md)
for version history.

## License and credit

Sumire is dedicated to the public domain under [CC0 1.0 Universal](LICENSE).
See [third-party notices](THIRD-PARTY-NOTICES.md) for Draft Copy's diff library
and the icons and wiki material used by Article Assessor.

[draft-copy-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/draft-copy.user.js
[draft-copy-wiki-script]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/draft-copy.min.js
[meta-contributions-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/meta-contributions.user.js
[meta-contributions-wiki-script]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/meta-contributions.min.js
[wpvg-assessor-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/wpvg-assessor.user.js
[wpvg-assessor-wiki-script]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/wpvg-assessor.min.js
[wpvg-source-labels-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/wpvg-source-labels.user.js
[sumire-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/sumire.user.js
[sumire-wiki-script]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/sumire.min.js
[wpvg-source-labels-minified]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/wpvg-source-labels.min.js
[profile]: https://meta.wikimedia.org/wiki/User:For_Each_..._Next
[sources]: https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Video_games/Sources
