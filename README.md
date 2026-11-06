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

### Sending data to a tool

Third-party tools can request the export directly, so you don't have to copy and paste it:

1. On the tool's website, click its import link (e.g. "Import from OGame"). It opens the OGame lobby.
2. Pick your server as usual. If the game is already open in another tab, the prompt appears there without a reload.
3. A prompt shows which website is requesting your data. Check the domain, then click **Send** to open the tool with your data, or **Cancel**.

Nothing is sent without your click. Closing the prompt cancels the request, and an unanswered request expires after 15 minutes.

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

### Receiving exports directly

Your tool can receive the export without the user copying anything, and without a userscript of its own. It works like an OAuth redirect without the server side:

1. You link the user to OGame with your import page as the return URL.
2. The exporter stores the request and, once the user is ingame, asks them whether to send their data to your domain.
3. On **Send**, it opens your return URL with the export in the fragment: `https://tool.example.com/import#oe-data=…`.

**The link.** URL-encode your import page and put it into the `oe-return` fragment parameter:

```html
<a href="https://lobby.ogame.gameforge.com/#oe-return=https%3A%2F%2Ftool.example.com%2Fimport">
  Import from OGame (requires Origin Exporter)
</a>
```

If you already know the user's server, you can link to an ingame page instead and skip the lobby, e.g. `https://s123-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview#oe-return=…`.

**The reader.** On your import page:

```js
async function readOriginExport() {
    const m = location.hash.match(/[#&]oe-data=([^&]*)/);
    if (!m) return null;
    // Remove the data from the address bar and history, keep the rest of the fragment.
    const rest = location.hash.slice(1).split('&')
        .filter((part) => part && !part.startsWith('oe-data='))
        .join('&');
    history.replaceState(history.state, '', location.pathname + location.search + (rest ? '#' + rest : ''));
    // base64url -> gzip -> JSON
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
}
```

The result is the same object as the copied or downloaded JSON, so validate it and check `schemaVersion` as described above.

**Details:**
- The return URL must be `https`. Plain `http` is accepted only for `localhost`, `127.0.0.1` and `[::1]`, for local development.
- Any query string in the return URL is kept. If it already has a fragment (hash routing, e.g. `#/import`), the data is appended with `&`: `#/import&oe-data=…`. Read it before your router processes the fragment.
- The data travels in the fragment, so it is not sent to your server or written to its access logs. Read it and remove it early, before analytics or other scripts on the page record the full URL.
- A pending request expires after 15 minutes, and a newer request replaces an older one.
- The payload is gzip-compressed, typically tens of kB. Exports that would exceed about 1.9 MB are refused, and the user is told to use Copy or Download instead.
- The data is supplied by the user's browser and isn't signed, so treat it like a pasted export. Keep the paste-JSON import as a fallback for users without the userscript or with an older version.

## Contributing

Contributions are welcome. The project is a single userscript (`origin-exporter.user.js`) with documentation in `docs/`.

### Development setup

1. Clone the repo.
2. Load `origin-exporter.user.js` into your userscript manager (Tampermonkey/Violentmonkey) — point it at your local file or paste the contents.
3. Make changes, test against OGame.
4. Bump `@version` in the userscript header and `SCHEMA_VERSION` in the script if the output structure changes. Add an entry to [CHANGELOG.md](./CHANGELOG.md).

### What to contribute

- **Bug reports** — if the export fails or produces incorrect data, open an issue with the error message and (if possible) the relevant snippet of the game's API response (redact your account details).
- **Localization fixes** — if DOM parsing breaks on a non-English game locale, open an issue with the tooltip HTML and your language.
- **Schema documentation** — if you spot inaccuracies in [`docs/schema.md`](./docs/schema.md) or new fields in the game API that aren't documented, PRs are welcome.

### Notes

- The `examples/` directory is gitignored — it contains real account data for local testing and should not be committed.
- The `LIFEFORM_TECH_TYPE` mapping is derived from the game's `serverData.xml`. If Gameforge adds new lifeform researches, this mapping needs updating.
- Keep the userscript dependency-free — no `@require` or external libraries.

## License

MIT
