# Sumire changelog

## 26.332.1 (2026-11-28)

### Changed

- Clarified which bundle, dimensions, and checksums the Article Assessor
  screenshot ledger records.

## 26.332.0 (2026-11-28)

### Added

- Moved Article Assessor from Kanade with its standalone scripts, PetScan
  links, and review workflow.
- Added a minified WPVG Source Labels userscript.

### Changed

- Draft Copy uses attributed revisions to merge changes before opening the
  native preview or diff. Conflicts remain available for manual review.
- Meta Profile Editor keeps item numbering consistent across editing,
  filtering, and review.
- Both aggregate builds bundle all four tools.
- Build and validate browser distributions through WP's shared builder.
- Article Assessor uses Sumire's storage keys and reads the current snapshot
  format. New-page list reviews require a revision ID.
