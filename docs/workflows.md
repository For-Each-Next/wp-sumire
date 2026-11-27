# Sumire workflows

## Draft Copy

The browser entrypoint selects HTTPS Chinese Wikipedia on desktop and
mobile. The action checks MediaWiki's page configuration and accepts an
existing mainspace article or draft with a viewable wikitext revision.
`mediawiki.ts` resolves titles, verifies source and target revisions, and
classifies file references through the local API. The shared WP adapter
reads Action API query and revision envelopes. Draft Copy owns title,
revision, content model, and edit-form validation.

`wikitext.ts` adds the draft header and empty todo list, wraps categories,
and disables references to local files. Preparing an article removes
draft material and restores those categories and files. `mediawiki.ts`
attributes the source revision in the edit summary and posts the form
with the target revision and current edit token. The browser reports
preparation failures. Review the resulting preview or diff and save in
the wiki editor.

## Meta Profile Editor

The Meta Profile action opens on the configured owner's user page after
checking the current title, signed-in user, and view mode. A local wiki
displaying the global profile must identify its canonical Meta-Wiki
source. Wikimedia sites use MediaWiki's authenticated API. Other sites
link to Meta-Wiki with the `personal-gadgets-edit-contributions` query
parameter, which opens the editor on the verified profile.

`meta-api.ts` verifies the owner, title, namespace, and revision after
the shared WP adapter reads the Action API envelope. The profile
wikitext parsers read the editable records and keep unrelated source
intact. The add-entry workflow accepts and normalizes a title, wikilink,
or URL before optional public metadata and attribution lookups. The
lookups validate their own responses and leave fields editable when
information is unavailable.

Either review control opens the same preview when there are draft changes
or missing contribution separators and the editor has no pending action
or removal confirmation. The preview shows the changed sections and
English edit summary. The user can return to the local draft or choose
**Save on Meta-Wiki**. The API adapter asserts the account and sends a
single revision-based edit. It reports an edit conflict or session
failure to the dialog, which keeps the draft available for review. An
unchanged edit returns the current revision.

## WPVG Source Labels

The entrypoint selects the HTTPS apex and `www` hosts of Metacritic and
OpenCritic. Navigation events and route polling start annotation on
critic-review routes, where one observer per document follows review
card changes. `review-sites.ts` reads each card's outlet name and
original links. Scheduled source-table refreshes run on review routes.

The browser reads the userscript manager's `wpvg-source-cache-v2` and
`wpvg-source-settings-v1` keys. `source-data.ts` validates stored values
and checks the revision and expected origin of anonymous source requests.
`source-table.ts` parses source table HTML in a detached template and
builds typed records. `source-match.ts` ranks those records against each
review and exposes the evidence for the displayed label. The interface
reports failed refreshes and keeps the last valid cache available.

The standalone userscript preserves its Tampermonkey identity and
storage. Sumire's aggregate has its own manager storage with the same
cache and settings schema. Only the review-host startup uses GM APIs.

## Distribution

`package.json` supplies the version, license, and aggregate description.
`scripts/build.mjs` bundles each entrypoint with esbuild and uses WP to
render userscript metadata and write the artifacts, license,
`manifest.json`, and `SHA256SUMS`.

`sumire.user.js` declares the versioned `sumire.runtime.js` dependency and
its SHA-256 integrity in `@require`. Tampermonkey installs and runs the
runtime through its JavaScript sandbox, which can access the page's
MediaWiki object. The runtime starts the review tool on review hosts and
starts Draft Copy before Meta Profile Editor on eligible Wikimedia
hosts. Action IDs and the review observer's document marker prevent
duplicate mounting. `sumire.full.user.js` embeds the same runtime. The
WPVG standalone uses Tampermonkey's DOM sandbox.
[Tampermonkey documentation][tampermonkey]

`sumire.min.js` and the per-tool Wiki bundles include their project runtime
and use MediaWiki's own ResourceLoader modules. Pasting the scripts into
`common.js` or `global.js` keeps that installation self-contained.

`npm run verify` checks formatting, lint, types, and the existing tool
tests, then builds and checks the distribution in `dist/`. The artifact
tests exercise manager and native startup with local fixtures.

Dispatch **Release** with **Publish** off to rehearse publication. Leave
the tag empty to verify the selected ref, or supply the release tag to
check that revision. For publication, dispatch with the annotated
`v<version>` tag and **Publish** on. The shared release workflow checks
the version and uploads the complete artifact set before making the
release available.

[tampermonkey]: https://www.tampermonkey.net/documentation.php
