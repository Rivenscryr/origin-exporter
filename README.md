# Origin Exporter

A userscript for [OGame](https://en.ogame.gameforge.com/) that lets players export their account data as a single JSON document. The export combines data from two game API endpoints with planet/moon information parsed from the DOM, producing a structured snapshot that can be pasted into third-party tools.

## Installation

1. Install a userscript manager browser extension:
   - [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari)
   - [Violentmonkey](https://violentmonkey.github.io/) (Chrome, Firefox)
2. Open [`origin-exporter.user.js`](./origin-exporter.user.js) and click the **Raw** button (or create a new script in your userscript manager and paste the contents).
3. Confirm the installation when prompted.
4. Navigate to any OGame ingame page — the Empire menu icon will gain a hover tint. Click it to open the exporter popup.

## Usage

1. Click the **Empire** icon in the OGame menu (it highlights on hover).
2. In the popup, click **Export account data**.
3. The script fetches `accountInfo` and `speciesBonuses` from the game server and parses planet/moon temperature, fields, and diameter from the current page.
4. Once complete, use **Copy JSON** or **Download JSON** to get the data.

The export reflects the state of the account at the moment the button is clicked — resources, production, fleet, defenses, and lifeform bonuses are all point-in-time values.

## Output format

The exported JSON is a single object. The structure is documented in [`docs/schema.md`](./docs/schema.md) and a machine-readable [JSON Schema](./docs/schema.json) is provided for validation.

**Note:** Most of the data is passed through from OGame's API endpoints with minimal transformation. If Gameforge changes their API, the export will reflect those changes. The `schemaVersion` field tracks changes to *our* transformations (stripping, merging, aggregating), not changes to the game's API. See [`docs/schema.md`](./docs/schema.md) for details.

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | integer | Output structure version (see [CHANGELOG.md](./CHANGELOG.md)) |
| `playerId` | integer | OGame player ID |
| `playerName` | string | Player display name |
| `characterClassId` | integer | Character class (1 = Collector, 2 = General, 3 = Discoverer) |
| `allianceClassId` | integer | Alliance class ID |
| `officers` | object | Active officers (boolean flags) |
| `researches` | object | Research levels keyed by technology ID |
| `species` | object | Lifeform species levels/experience and planet-to-species distribution |
| `planets` | object | Planet data keyed by planet ID |
| `moons` | object | Moon data keyed by moon ID |
| `speciesBonuses` | object | Detailed lifeform bonus breakdown (categories directly under this key) |
| `bonusByType` | object | Simplified bonus totals aggregated by lifeform research type |
| `exportedAt` | string | ISO 8601 timestamp of the export |

### What is included

**From the `accountInfo` API endpoint** (passed through largely as received, with transport metadata stripped):
- Player identity, class, officers, research levels
- Per-planet and per-moon: resources, production, buildings, ships, defenses, lifeform buildings/researches, active buffs
- Lifeform species levels and which species is assigned to each planet

**From the `speciesBonuses` API endpoint** (stripped of localization/reference data):
- `speciesBonuses` — detailed bonus breakdown per category (resources, ships, defenses, cost reduction, character classes, misc), including per-planet and per-technology contributions
- `bonusByType` — a simplified aggregate view (see below)

**Parsed from the page DOM** (merged into planet/moon entries):
- Planet/moon `name`, `diameter`, `fields` (used/total), and `temperature` (min/max for planets only)

### `bonusByType`

This is a convenience section that aggregates the `technologyBonus` data from `speciesBonuses` by lifeform research **bonus type** (derived from the game's `serverData.xml` public API). The structure is simplified based on the data:

- If a bonus type has a single value, it collapses to that value directly (e.g. `"ShipFuelConsumption": 0.15`)
- If a bonus type applies per-entry with a single dimension each, it becomes `{ entryId: value }` (e.g. `"ProductionBooster": { "metal": 0.97, "crystal": 0.60, "deuterium": 0.60 }`)
- If entries have multiple dimensions, the full `{ dim: value }` object is kept per entry (e.g. `"BaseStatsBooster": { "202": { "cargo": 4.16, "speed": 3.68 }, ... }`)

Zero-value dimensions are stripped. See [`docs/schema.md`](./docs/schema.md) for the full list of bonus types.

## For third-party developers

If you are building a tool that consumes this export:

1. Read [`docs/schema.md`](./docs/schema.md) for the complete field reference, including OGame technology/building ID mappings.
2. Use [`docs/schema.json`](./docs/schema.json) to validate incoming exports.
3. Check `schemaVersion` and handle or reject versions you don't support. See [CHANGELOG.md](./CHANGELOG.md) for what changed between versions.
4. All numeric values are raw game values — resource amounts are integers, production rates are floats (per hour), and bonus multipliers are fractional (e.g. `0.25` = 25%).
5. The `exportedAt` timestamp tells you when the data was captured. Resource and production values are point-in-time and will drift.

## License

MIT
