# Sumire

Sumire prepares attributed draft copies on Chinese Wikipedia, edits the
owner's global user profile, and labels game reviews with Wikipedia source
classifications.

## Install

Install the all-in-one [sumire.user.js][sumire-userscript] in Tampermonkey
for all three tools, or use [sumire.min.js][sumire-wiki-script] for Draft
Copy and Meta Profile Editor on MediaWiki.

| Tool                                        | What it does                                                                                    | Scripts                                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Draft Copy](#draft-copy)                   | Copy articles to drafts and prepare attributed edits to publish drafts on Chinese Wikipedia.    | <ul><li>[draft-copy.user.js][draft-copy-userscript] (Tampermonkey)</li><li>[draft-copy.min.js][draft-copy-wiki-script] (MediaWiki)</li></ul>                                 |
| [Meta Profile Editor](#meta-profile-editor) | Edit contributions, barnstars, quotations, and userboxes on the global user profile.            | <ul><li>[meta-contributions.user.js][meta-contributions-userscript] (Tampermonkey)</li><li>[meta-contributions.min.js][meta-contributions-wiki-script] (MediaWiki)</li></ul> |
| [WPVG Source Labels](#wpvg-source-labels)   | Label reviews on Metacritic and OpenCritic with WikiProject Video games source classifications. | <ul><li>[wpvg-source-labels.user.js][wpvg-source-labels-userscript] (Tampermonkey)</li></ul>                                                                                 |

- Open a `.user.js` file in Tampermonkey. Use
  [sumire.full.user.js][sumire-full-userscript] for a self-contained
  installation.
- Paste a complete `.min.js` file into `Special:MyPage/common.js` on the
  wiki or `Special:MyPage/global.js` on Meta-Wiki.

Choose the aggregate or the standalone scripts in each installation. The
WPVG standalone keeps its existing Tampermonkey storage. The aggregate
has its own stored WPVG settings and refreshes its cache on first use.

## Use the tools

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
Meta-Wiki**. Both Wiki tools support English, Simplified Chinese, and
Traditional Chinese.

### WPVG Source Labels

Open a game's critic-review list on Metacritic or OpenCritic. Choose a
WPVG label to inspect the matching evidence, source notes, and links to
the cited Wikipedia revision. The Traditional Chinese dialog identifies
ambiguous matches and date-dependent classifications. Use the WPVG menu
to refresh the [source table][sources] or hide unmatched labels.

## Build and verify

Use Node.js 26 and npm 11.

```sh
npm ci
npm run verify
```

See [Workflows](docs/workflows.md) for validation ownership, distribution,
and release preparation. Sumire is dedicated to the public domain under
[CC0 1.0 Universal](LICENSE).

[profile]: https://meta.wikimedia.org/wiki/User:For_Each_..._Next
[sumire-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/sumire.user.js
[sumire-wiki-script]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/sumire.min.js
[sumire-full-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/sumire.full.user.js
[draft-copy-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/draft-copy.user.js
[draft-copy-wiki-script]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/draft-copy.min.js
[meta-contributions-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/meta-contributions.user.js
[meta-contributions-wiki-script]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/meta-contributions.min.js
[wpvg-source-labels-userscript]: https://github.com/For-Each-Next/wp-sumire/releases/latest/download/wpvg-source-labels.user.js
[sources]: https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Video_games/Sources
