# Changelog

All notable changes to the output format will be documented here. The `schemaVersion` field in the export is bumped when the structure changes in a way that consumers need to handle.

## [1.1.0] - 2026-08-25

### Changed
- Flattened `speciesBonuses`: the `.data` wrapper has been removed. Categories (`resources`, `ships`, `defenses`, `costreduction`, `characterclasses`, `misc`) are now directly under `speciesBonuses`.
- `bonusByType` now uses a **fixed shape per bonus type** instead of adapting based on data content. Each bonus type always produces the same structure (scalar, `{ dim: value }`, `{ entryId: value }`, or `{ entryId: { dim: value } }`) regardless of how many entries or dimensions are present. This means `CostReduction` always keeps the tech ID (e.g. `{ "109": { "cost": ..., "time": ... } }`) since the tech ID is semantically meaningful.
- Temperature regex no longer depends on the English connector word ("to") — works across all game locales.
- Diameter regex now accepts both comma and period as thousands separator.
- Fields regex matched independently from diameter.

### Added
- `schemaVersion` field in the output (integer, currently `1`).

## [1.0.0] - 2026-08-24

### Added
- Initial release.
- Exports player info, officers, researches, species (lifeforms), planets, and moons from the `accountInfo` endpoint.
- Exports detailed lifeform bonus data from the `speciesBonuses` endpoint.
- Parses planet/moon name, diameter, fields, and temperature from the page DOM.
- `bonusByType` aggregate view of lifeform bonuses by research type.
- Copy and download functionality.
