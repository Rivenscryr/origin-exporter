# Export Format Reference

This document describes the structure of the JSON produced by Origin Exporter. It is intended for third-party developers who want to consume the export data.

A machine-readable [JSON Schema](./schema.json) is also available — it validates the structural elements that Origin Exporter controls (top-level keys, DOM-parsed fields, `bonusByType` shapes). The bulk of the data is pass-through from OGame's API endpoints and is not fully validated, as the game's API can change without notice.

## Caveat: pass-through data

Most of the export is data from OGame's `accountInfo` and `speciesBonuses` API endpoints, passed through with minimal transformation (stripping transport/localization fields, merging DOM-parsed planet data). This means:

- The structure of pass-through fields (planets, moons, researches, speciesBonuses categories) is defined by the game, not by this exporter.
- If Gameforge changes their API, the export will reflect those changes automatically — fields may appear, disappear, or change shape.
- The JSON schema can validate what *we* add or transform (top-level keys, DOM-parsed fields, `bonusByType`), but cannot guarantee the pass-through data matches what's documented here at any given time.

Treat this document as a best-effort description of the current state, not a contract.

## Versioning

The output includes a `schemaVersion` integer field. This is bumped when *our transformations* change — not when the game's API changes (we can't control or predict those). See [CHANGELOG.md](../CHANGELOG.md) for details.

When consuming exports, check `schemaVersion` and handle or reject versions you don't support. Within a schema version, the game API may introduce new technology/building IDs (keyed by string, won't break existing parsing) or change pass-through field shapes (outside our control).

## Data sources

The export is built from three sources:

1. **`accountInfo` API endpoint** — the bulk of the data. Passed through largely as received, with transport metadata (`components`, `newAjaxToken`) and the redundant `spaceObjects` lookup stripped. Planet and moon entries are then augmented with DOM-parsed fields.
2. **`speciesBonuses` API endpoint** — lifeform bonus data. Stripped of localization/reference data (`static`, `details`, `speciesInformation`, `components`, `newAjaxToken`). The `data` object is placed directly as `speciesBonuses` (no nesting).
3. **Page DOM** — planet/moon tooltips are parsed for `name`, `diameter`, `fields`, and `temperature` (planets only). These are merged into the corresponding planet/moon entries from `accountInfo`.

## Top-level object

```jsonc
{
  "schemaVersion": 1,               // integer — output structure version
  "playerId": 108222,               // integer — OGame player ID
  "playerName": "Commander Nova",   // string — player display name
  "characterClassId": 2,            // integer — see Character class IDs
  "allianceClassId": 1,             // integer — alliance class ID
  "officers": { ... },              // object — see Officers
  "researches": { ... },            // object — see Researches
  "species": { ... },               // object — see Species (lifeforms)
  "planets": { ... },               // object — see Planets
  "moons": { ... },                 // object — see Moons
  "speciesBonuses": { ... },        // object — see SpeciesBonuses
  "bonusByType": { ... },           // object — see BonusByType
  "exportedAt": "2026-01-15T12:30:00.000Z" // string — ISO 8601 timestamp
}
```

## Character class IDs

| ID | Class |
|----|-------|
| 1  | Collector |
| 2  | General |
| 3  | Discoverer |

## Officers

Boolean flags indicating whether each officer is active.

```jsonc
{
  "commander": true,
  "admiral": false,
  "engineer": false,
  "geologist": true,
  "technocrat": false
}
```

## Researches

Research levels keyed by technology ID (string keys, integer values).

```jsonc
{
  "106": 18,   // Espionage Technology
  "108": 20,   // Computer Technology
  "109": 25,   // Weapons Technology
  "110": 22,   // Shielding Technology
  "111": 24,   // Armour Technology
  "113": 19,   // Energy Technology
  "114": 16,   // Hyperspace Technology
  "115": 21,   // Combustion Drive
  "117": 19,   // Impulse Drive
  "118": 22,   // Hyperspace Drive
  "120": 10,   // Laser Technology
  "121": 4,    // Ion Technology
  "122": 20,   // Plasma Technology
  "123": 10,   // Intergalactic Research Network
  "124": 30,   // Astrophysics
  "199": 1     // Graviton Technology
}
```

## Species (lifeforms)

Lifeform species experience/levels and which species is assigned to each planet.

```jsonc
{
  "values": {
    "701": { "experience": 1500000, "level": 75 },
    "702": { "experience": 1200000, "level": 70 },
    "703": { "experience": 1100000, "level": 68 },
    "704": { "experience": 900000, "level": 65 }
  },
  "distribution": {
    "30200301": 702,   // planet ID -> species ID
    "30200302": 703,
    // ...
    "30200320": null   // moons have null (no lifeform)
  }
}
```

### Species IDs

| ID | Species (lifeform) |
|----|---------------------|
| 701 | Humans |
| 702 | Rock'tal |
| 703 | Mechas |
| 704 | Kaelesh |

## Planets

Object keyed by planet ID (string). Each value:

```jsonc
{
  "30200301": {
    "id": 30200301,
    "galaxy": 4,
    "system": 121,
    "position": 8,
    "siblingId": 30200320,       // ID of the moon orbiting this planet (if any)
    "buffs": [ ... ],             // array — see Buffs
    "resources": { ... },         // object — see Resources
    "baseProduction": { ... },    // object — see Base production
    "production": { ... },        // object — see Production
    "selectedSpeciesId": 702,     // lifeform species on this planet
    "selectedSpeciesTechnologyIds": [ 14201, 11202, 12101, 12102, ... ], // active lifeform research AND building IDs
    "buildings": { ... },         // object — building levels, see Building IDs
    "ships": { ... },             // object — ship counts, see Ship IDs
    "defenses": { ... },          // object — defense counts, see Defense IDs
    "speciesBuildings": { ... },  // object — lifeform building levels, see Lifeform Building IDs
    "speciesResearches": { ... }, // object — lifeform research levels, see Lifeform Research IDs

    // DOM-parsed fields (added by Origin Exporter):
    "name": "Homeworld",
    "diameter": 12800,            // km
    "fields": { "used": 280, "total": 320 },
    "temperature": { "min": 8, "max": 48 }  // °C, planets only
  }
}
```

### `selectedSpeciesTechnologyIds`

Contains the IDs of **both** active lifeform researches and active lifeform buildings. A lifeform building is "active" if it belongs to the planet's `selectedSpeciesId`. Inactive species buildings/researches may still have levels in `speciesBuildings`/`speciesResearches` (their effects are just not applied) — it's up to the consumer to decide how to interpret that.

## Moons

Same structure as planets, except:
- No `baseProduction`, `selectedSpeciesId`, `selectedSpeciesTechnologyIds`, `speciesBuildings`, `speciesResearches`, or `temperature` fields
- `resources` has 4 keys (metal, crystal, deuterium, energy) — no population/food
- `siblingId` points to the parent planet

Moons do have a temperature in the game, but it has no gameplay relevance and is not exposed in the DOM tooltips, so it is not included in the export.

```jsonc
{
  "30200320": {
    "id": 30200320,
    "galaxy": 4,
    "system": 121,
    "position": 8,
    "siblingId": 30200301,       // ID of the parent planet
    "buffs": [ ... ],
    "resources": { "metal": 5000000, "crystal": 2000000, "deuterium": 8000000, "energy": 0 },
    "production": { "metal": 0, "crystal": 0, "deuterium": 0 },
    "buildings": { ... },
    "ships": { ... },
    "defenses": { ... },

    // DOM-parsed fields:
    "name": "Main Moon",
    "diameter": 8400,
    "fields": { "used": 45, "total": 50 }
  }
}
```

## Buffs

Active item buffs on a planet/moon. Each entry:

```jsonc
{
  "rarity": "rare",              // "common" | "uncommon" | "rare" | "epic"
  "itemUuid": "a1b2c3d4e5f6...", // unique item identifier
  "name": "Gold Planet Fields",  // buff name (may be localized)
  "buffStart": 1679492849,       // unix timestamp, may be null
  "buffEnd": null,               // unix timestamp, null = permanent/active
  "effectStart": 1679492849,
  "effectEnd": null
}
```

## Resources

```jsonc
{
  "metal": 3200000,
  "crystal": 180000,
  "deuterium": 95000,
  "energy": -15000,             // negative = deficit
  "population": 5000000000,     // planets only
  "food": 12000000              // planets only
}
```

## Base production

A separate base production value that the planet has independent of any mines or buildings. This is not "production before bonuses" — it's an intrinsic property of the planet.

```jsonc
{
  "metal": 405,
  "crystal": 150,
  "deuterium": 0
}
```

## Production

Per-hour production rates (floats). These are the actual production values after all bonuses are applied.

```jsonc
{
  "metal": 850000.5,
  "crystal": 32000.2,
  "deuterium": 28000.1
}
```

## Building IDs

Keyed by string ID, value is the building level.

| ID | Building |
|----|----------|
| 1  | Metal Mine |
| 2  | Crystal Mine |
| 3  | Deuterium Synthesizer |
| 4  | Solar Plant |
| 12 | Fusion Reactor |
| 14 | Robotics Factory |
| 15 | Nanite Factory |
| 21 | Shipyard |
| 22 | Metal Storage |
| 23 | Crystal Storage |
| 24 | Deuterium Tank |
| 31 | Research Lab |
| 33 | Terraformer |
| 34 | Alliance Depot |
| 36 | Space Dock |
| 41 | Lunar Base |
| 42 | Sensor Phalanx |
| 43 | Jump Gate |
| 44 | Missile Silo |

## Ship IDs

Keyed by string ID, value is the ship count.

| ID | Ship |
|----|------|
| 202 | Light Cargo |
| 203 | Large Cargo |
| 204 | Light Fighter |
| 205 | Heavy Fighter |
| 206 | Cruiser |
| 207 | Battleship |
| 208 | Colony Ship |
| 209 | Recycler |
| 210 | Espionage Probe |
| 211 | Bomber |
| 212 | Solar Satellite |
| 213 | Destroyer |
| 214 | Deathstar |
| 215 | Battlecruiser |
| 217 | Crawler |
| 218 | Reaper |
| 219 | Pathfinder |

## Defense IDs

Keyed by string ID, value is the defense count.

| ID | Defense |
|----|---------|
| 401 | Rocket Launcher |
| 402 | Light Laser |
| 403 | Heavy Laser |
| 404 | Gauss Cannon |
| 405 | Ion Cannon |
| 406 | Plasma Turret |
| 407 | Small Shield Dome |
| 408 | Large Shield Dome |
| 502 | Anti-Ballistic Missile |
| 503 | Interplanetary Missile |

## Lifeform Building IDs

Keyed by string ID, value is the building level. The first digit indicates the species:

| Range | Species |
|-------|---------|
| 11101–11112 | Humans (lifeform 1) |
| 12101–12112 | Rock'tal (lifeform 2) |
| 13101–13112 | Mechas (lifeform 3) |
| 14101–14112 | Kaelesh (lifeform 4) |

Buildings for species other than the planet's `selectedSpeciesId` may still have non-zero levels — they are built but their effects are not active. Use `selectedSpeciesTechnologyIds` to determine which are active.

## Lifeform Research IDs

Keyed by string ID, value is the research level. The first digit indicates the species:

| Range | Species |
|-------|---------|
| 11201–11218 | Humans (lifeform 1) |
| 12201–12218 | Rock'tal (lifeform 2) |
| 13201–13218 | Mechas (lifeform 3) |
| 14201–14218 | Kaelesh (lifeform 4) |

Each research grants a bonus type — see [Bonus types](#bonus-types) below.

## SpeciesBonuses

Detailed lifeform bonus data from the `speciesBonuses` API endpoint. Stripped of localization data (`static`, `details`) and redundant fields (`speciesInformation`, `components`, `newAjaxToken`). The `data` wrapper has been flattened — the categories are directly under `speciesBonuses`.

```jsonc
{
  "resources": { ... },        // resource production bonuses
  "ships": { ... },            // ship stat bonuses
  "defenses": { ... },         // defense stat bonuses
  "costreduction": { ... },    // research/building cost & time reductions
  "characterclasses": { ... }, // character class bonuses
  "misc": { ... }              // miscellaneous bonuses
}
```

Each entry within a category has this shape:

```jsonc
{
  "totalBonus": { ... },         // summed bonus across all sources
  "spaceObjectBonus": { ... },   // per-planet/moon bonus contributions
  "technologyBonus": { ... },    // per-planet, per-tech bonus contributions
  "maximumBonusFuel": ...,       // (resources/ships only) fuel-related max
  "maximumBonusTime": ...,       // (costreduction/characterclasses) time-related max
  "maximumBonusCost": ...,       // (costreduction) cost-related max
  "maximumBonus": ...            // (misc) max bonus
}
```

`technologyBonus` structure:
```jsonc
{
  "30200301": {                 // planet ID
    "11202": {                   // lifeform research tech ID
      "metal": 0.015028,         // bonus dimension -> value
      "quantity": 23             // research level (not a bonus dim)
    }
  }
}
```

## BonusByType

A simplified aggregate of `speciesBonuses.*.technologyBonus`, grouped by lifeform research bonus type. The bonus type for each technology ID is derived from the game's `serverData.xml` public API.

Each bonus type has a **fixed output shape** determined by the type's semantics — not by the data content. This means consumers always know what structure to expect for a given type. The shapes are:

| Shape | Structure | Meaning |
|-------|-----------|---------|
| `scalar` | `number` | Global bonus, single dimension. Applies uniformly to everything (e.g. all ships, all research). |
| `multiDim` | `{ dim: number }` | Global bonus, multiple dimensions. Applies uniformly but has several aspects. |
| `perEntry` | `{ entryId: number }` | Per-entry bonus, single dimension. The entryId is meaningful (e.g. resource name, class ID). |
| `perEntryDim` | `{ entryId: { dim: number } }` | Per-entry bonus, multiple dimensions. The entryId is meaningful (e.g. ship ID, tech ID). |

### Shape per bonus type

| Bonus type | Shape | Entry ID meaning | Example |
|------------|-------|------------------|---------|
| `Discoverer` | `scalar` | — | `0.01147` |
| `ShipFuelConsumption` | `scalar` | — | `0.14993` |
| `ResearchSpeed` | `scalar` | — | `0.60307` |
| `FleetReturnDeuterium` | `scalar` | — | `0.05` |
| `PhalanxRangeBooster` | `scalar` | — | `0.10` |
| `ExpeditionBooster` | `scalar` | — | `0.15` |
| `ExpeditionFleetLossReduction` | `scalar` | — | `0.05` |
| `ExpeditionShipsFoundBooster` | `scalar` | — | `0.10` |
| `ExpeditionSpeedBooster` | `scalar` | — | `0.20` |
| `ExpeditionDMIncrease` | `scalar` | — | `0.10` |
| `DenCapacityBooster` | `multiDim` | — | `{ "metal": 2.9, "crystal": 2.9, "deuterium": 2.9, "storage": 2.9 }` |
| `ImprovedCrawler` | `multiDim` | — | `{ "output": 0.3, "reduction": 0.1 }` |
| `ProductionBooster` | `perEntry` | resource name | `{ "metal": 0.97, "crystal": 0.60, "deuterium": 0.60 }` |
| `CharacterClassBooster` | `perEntry` | class ID (601=Collector, 602=General, 603=Discoverer) | `{ "602": 0.537 }` |
| `BaseStatsBooster` | `perEntryDim` | ship ID | `{ "202": { "cargo": 4.16, "speed": 3.68 }, "206": { "armor": 2.16, ... } }` |
| `CostReduction` | `perEntryDim` | research/building tech ID | `{ "109": { "cost": 0.024, "time": 0.024 } }` |

Zero-value dimensions are always stripped. A bonus type may not appear in a given export if the player hasn't researched the relevant lifeform technologies.

### Bonus type details

| Bonus type | Dimensions | Description |
|------------|------------|-------------|
| `ProductionBooster` | metal, crystal, deuterium | Resource production boost |
| `BaseStatsBooster` | armor, shield, weapon, cargo, speed, fuel | Ship stat boosts (per ship ID) |
| `ShipFuelConsumption` | fuel | Ship fuel consumption reduction (applies to all ships) |
| `CostReduction` | cost, time | Research/building cost and time reduction (per tech ID) |
| `ResearchSpeed` | time | Research speed boost (applies to all research) |
| `DenCapacityBooster` | metal, crystal, deuterium, storage | Den and storage capacity boost |
| `CharacterClassBooster` | characterClass | Character class bonus boost (per class ID) |
| `Discoverer` | discoveryBonus | Exploration flight fleet speed bonus |
| `ImprovedCrawler` | output, reduction | Crawler output boost and resource consumption reduction |
| `FleetReturnDeuterium` | fleetReturnDeuterium | Fleet recall deuterium refund |
| `PhalanxRangeBooster` | phalanxRange | Sensor phalanx range boost |
| `ExpeditionBooster` | expeditionBonus | Expedition bonus |
| `ExpeditionFleetLossReduction` | expeditionFleetLossReduction | Reduces expedition fleet losses |
| `ExpeditionShipsFoundBooster` | expeditionShipsFound | Increases ships found on expeditions |
| `ExpeditionSpeedBooster` | expeditionSpeed | Expedition fleet speed boost |
| `ExpeditionDMIncrease` | expeditionDMIncrease | Dark matter find increase |

### Lifeform research → bonus type mapping

| Tech ID | Bonus type |
|---------|------------|
| 11201 | Discoverer |
| 11202, 11208, 12201–12203, 12205–12207, 12210–12212, 13201, 13206, 13213, 14202, 14212 | ProductionBooster |
| 11203, 11209, 11210, 11214–11216, 12204, 12208, 12216, 13202, 13205, 13208, 13209, 13212, 13214–13216, 14206, 14209, 14214, 14216 | BaseStatsBooster |
| 11204, 11207, 11212, 11213, 11218, 12209, 12214, 12215, 12217, 13204, 13207, 13211, 13217, 14217 | CostReduction |
| 11205 | DenCapacityBooster |
| 11206, 11211, 11217, 14207, 14213 | ResearchSpeed |
| 12213 | ImprovedCrawler |
| 12218, 13218, 14218 | CharacterClassBooster |
| 13203, 14201 | ShipFuelConsumption |
| 13210 | FleetReturnDeuterium |
| 14208 | PhalanxRangeBooster |
| 14203 | ExpeditionFleetLossReduction |
| 14204 | ExpeditionShipsFoundBooster |
| 14205, 14211 | ExpeditionBooster |
| 14210 | ExpeditionSpeedBooster |
| 14215 | ExpeditionDMIncrease |
