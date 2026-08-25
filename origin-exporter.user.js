// ==UserScript==
// @name         Origin Exporter
// @namespace    https://github.com/Rivenscryr/origin-exporter
// @version      1.1.0
// @description  Adds an export button to the OGame Empire menu that fetches account data, parses planet info from the DOM, and lets you copy/download a combined JSON.
// @author       RiV- (Rivenscryr)
// @match        https://*.ogame.gameforge.com/game/index.php?page=ingame&component=*
// @grant        none
// @run-at       document-idle
// @updateURL    https://github.com/Rivenscryr/origin-exporter/raw/master/origin-exporter.user.js
// @downloadURL  https://github.com/Rivenscryr/origin-exporter/raw/master/origin-exporter.user.js
// ==/UserScript==

(function () {
    'use strict';

    const STYLE_ID = 'origin-exporter-style';
    const POPUP_ID = 'origin-exporter-popup';
    const OVERLAY_ID = 'origin-exporter-overlay';

    // Bumped when the output structure changes in a way that consumers need to
    // handle. See docs/schema.md and CHANGELOG.md for details.
    const SCHEMA_VERSION = 1;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .menuImage.empire {
                cursor: pointer !important;
                transition: filter 0.15s ease;
            }
            .menuImage.empire:hover {
                filter: sepia(100%) saturate(400%) hue-rotate(350deg) !important;
            }
            #${OVERLAY_ID} {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.6);
                z-index: 100000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: Verdana, Arial, sans-serif;
            }
            #${POPUP_ID} {
                background: linear-gradient(180deg, #1a1a2e 0%, #0f0f1e 100%);
                border: 1px solid #4a6fa5;
                border-radius: 8px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7);
                color: #e0e0e0;
                width: 480px;
                max-width: 90vw;
                max-height: 85vh;
                overflow: auto;
                padding: 20px 24px;
            }
            #${POPUP_ID} h2 {
                margin: 0 0 8px 0;
                color: #8fb8e0;
                font-size: 18px;
                border-bottom: 1px solid #4a6fa5;
                padding-bottom: 8px;
            }
            #${POPUP_ID} .oe-desc {
                margin: 0 0 16px 0;
                font-size: 12px;
                color: #a0a0a0;
                line-height: 1.5;
            }
            #${POPUP_ID} .oe-status {
                margin: 12px 0;
                font-size: 12px;
                color: #ffd700;
                min-height: 16px;
            }
            #${POPUP_ID} .oe-status.success { color: #6fcf97; }
            #${POPUP_ID} .oe-status.error { color: #ff6b6b; }
            #${POPUP_ID} .oe-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-top: 12px;
            }
            #${POPUP_ID} button {
                background: #2a3a5a;
                border: 1px solid #4a6fa5;
                color: #e0e0e0;
                padding: 8px 14px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-family: inherit;
                transition: background 0.15s ease;
            }
            #${POPUP_ID} button:hover:not(:disabled) {
                background: #3a5a8a;
            }
            #${POPUP_ID} button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            #${POPUP_ID} button.oe-primary {
                background: #4a6fa5;
                border-color: #6a8fc5;
            }
            #${POPUP_ID} button.oe-primary:hover:not(:disabled) {
                background: #5a7fb5;
            }
            #${POPUP_ID} .oe-close {
                float: right;
                background: transparent;
                border: none;
                color: #a0a0a0;
                font-size: 18px;
                padding: 0 4px;
                line-height: 1;
            }
            #${POPUP_ID} .oe-close:hover {
                color: #ff6b6b;
                background: transparent;
            }
            #${POPUP_ID} textarea {
                width: 100%;
                height: 120px;
                margin-top: 12px;
                background: #0a0a14;
                color: #8fb8e0;
                border: 1px solid #2a3a5a;
                border-radius: 4px;
                font-family: monospace;
                font-size: 11px;
                padding: 8px;
                box-sizing: border-box;
                resize: vertical;
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    function decodeHtml(html) {
        const txt = document.createElement('textarea');
        txt.innerHTML = html;
        return txt.value;
    }

    function parseTooltip(tooltipHtml) {
        const decoded = decodeHtml(tooltipHtml);
        const tmp = document.createElement('div');
        tmp.innerHTML = decoded;

        const titleEl = tmp.querySelector('b');
        if (!titleEl) return null;

        const titleText = titleEl.textContent.trim();
        const coordsMatch = titleText.match(/\[(\d+):(\d+):(\d+)\]/);
        const name = titleText.replace(/\s*\[.*\]\s*$/, '').trim();
        const coords = coordsMatch ? `[${coordsMatch[1]}:${coordsMatch[2]}:${coordsMatch[3]}]` : null;

        const fullText = tmp.textContent || '';

        // Lifeform: Rock'tal  (label is localized — only use if present)
        const lifeformMatch = fullText.match(/Lifeform:\s*(.+)/i);
        const lifeform = lifeformMatch ? lifeformMatch[1].trim() : null;

        // Fields: (314/339) — the parenthesized used/total pattern is numeric
        // and localization-independent. Match independently of the diameter line.
        const fieldsMatch = fullText.match(/\((\d+)\/(\d+)\)/);
        const fieldsUsed = fieldsMatch ? parseInt(fieldsMatch[1], 10) : null;
        const fieldsTotal = fieldsMatch ? parseInt(fieldsMatch[2], 10) : null;

        // Diameter: 13,808km or 13.808km — thousands separator is locale-dependent
        // (comma or period), so accept both. "km" is a universal unit abbreviation.
        const diameterMatch = fullText.match(/([\d.,]+)\s*km/i);
        const diameter = diameterMatch
            ? parseInt(diameterMatch[1].replace(/[.,]/g, ''), 10)
            : null;

        // Temperature: "8°C to 48°C" — the connector word ("to"/"bis"/"à") is
        // localized, so don't match it. Just find all °C values and take the
        // first two (min, max).
        const tempValues = [...fullText.matchAll(/(-?\d+)°C/g)].map((m) => parseInt(m[1], 10));
        const tempMin = tempValues.length >= 1 ? tempValues[0] : null;
        const tempMax = tempValues.length >= 2 ? tempValues[1] : null;

        return {
            name,
            coords,
            lifeform,
            diameter,
            fieldsUsed,
            fieldsTotal,
            tempMin,
            tempMax,
        };
    }

    function parsePlanetsFromDom() {
        const planets = [];
        const moons = [];
        const planetNodes = document.querySelectorAll('#planetList .smallplanet');

        planetNodes.forEach((node) => {
            const idAttr = node.id || '';
            const idMatch = idAttr.match(/^planet-(\d+)$/);
            const planetId = idMatch ? parseInt(idMatch[1], 10) : null;

            const planetLink = node.querySelector('a.planetlink');
            if (!planetLink) return;
            const planetTooltip = planetLink.getAttribute('data-tooltip-title') || '';
            const planetData = parseTooltip(planetTooltip);
            if (!planetData) return;
            planetData.id = planetId;
            planetData.type = 'planet';
            planets.push(planetData);

            const moonLink = node.querySelector('a.moonlink');
            if (moonLink) {
                const moonIdMatch = (moonLink.getAttribute('href') || '').match(/cp=(\d+)/);
                const moonId = moonIdMatch ? parseInt(moonIdMatch[1], 10) : null;
                const moonTooltip = moonLink.getAttribute('data-tooltip-title') || '';
                const moonData = parseTooltip(moonTooltip);
                if (moonData) {
                    moonData.id = moonId;
                    moonData.type = 'moon';
                    moonData.parentCoords = planetData.coords;
                    moons.push(moonData);
                }
            }
        });

        return { planets, moons };
    }

    async function fetchJson(url) {
        const res = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.json();
    }

    // Fields to strip from the API responses — either transport-only or
    // generic reference/localization data that isn't account-specific.
    //   components, newAjaxToken      -> transport metadata
    //   spaceObjects (accountInfo)    -> redundant id->type lookup; planets/moons
    //                                     are already split into their own dicts
    //   static (speciesBonuses)       -> generic reference data: technology names,
    //                                     category/resource/expedition labels, etc.
    //   speciesInformation (speciesBonuses) -> redundant with accountInfo.species.values
    const STRIP_KEYS = ['components', 'newAjaxToken', 'spaceObjects', 'static', 'speciesInformation'];

    // Mapping from lifeform research technologyId -> bonus type, derived from
    // the game's lifeformBonuses.xml. Used to aggregate technologyBonus data
    // into a simplified per-type view.
    const LIFEFORM_TECH_TYPE = {
        11201: 'Discoverer',                   11202: 'ProductionBooster',    11203: 'BaseStatsBooster',
        11204: 'CostReduction',                11205: 'DenCapacityBooster',   11206: 'ResearchSpeed',
        11207: 'CostReduction',                11208: 'ProductionBooster',    11209: 'BaseStatsBooster',
        11210: 'BaseStatsBooster',             11211: 'ResearchSpeed',        11212: 'CostReduction',
        11213: 'CostReduction',                11214: 'BaseStatsBooster',     11215: 'BaseStatsBooster',
        11216: 'BaseStatsBooster',             11217: 'ResearchSpeed',        11218: 'CostReduction',
        12201: 'ProductionBooster',            12202: 'ProductionBooster',    12203: 'ProductionBooster',
        12204: 'BaseStatsBooster',             12205: 'ProductionBooster',    12206: 'ProductionBooster',
        12207: 'ProductionBooster',            12208: 'BaseStatsBooster',     12209: 'CostReduction',
        12210: 'ProductionBooster',            12211: 'ProductionBooster',    12212: 'ProductionBooster',
        12213: 'ImprovedCrawler',              12214: 'CostReduction',        12215: 'CostReduction',
        12216: 'BaseStatsBooster',             12217: 'CostReduction',        12218: 'CharacterClassBooster',
        13201: 'ProductionBooster',            13202: 'BaseStatsBooster',     13203: 'ShipFuelConsumption',
        13204: 'CostReduction',                13205: 'BaseStatsBooster',     13206: 'ProductionBooster',
        13207: 'CostReduction',                13208: 'BaseStatsBooster',     13209: 'BaseStatsBooster',
        13210: 'FleetReturnDeuterium',         13211: 'CostReduction',        13212: 'BaseStatsBooster',
        13213: 'ProductionBooster',            13214: 'BaseStatsBooster',     13215: 'BaseStatsBooster',
        13216: 'BaseStatsBooster',             13217: 'CostReduction',        13218: 'CharacterClassBooster',
        14201: 'ShipFuelConsumption',          14202: 'ProductionBooster',    14203: 'ExpeditionFleetLossReduction',
        14204: 'ExpeditionShipsFoundBooster',  14205: 'ExpeditionBooster',    14206: 'BaseStatsBooster',
        14207: 'ResearchSpeed',                14208: 'PhalanxRangeBooster',  14209: 'BaseStatsBooster',
        14210: 'ExpeditionSpeedBooster',       14211: 'ExpeditionBooster',    14212: 'ProductionBooster',
        14213: 'ResearchSpeed',                14214: 'BaseStatsBooster',     14215: 'ExpeditionDMIncrease',
        14216: 'BaseStatsBooster',             14217: 'CostReduction',        14218: 'CharacterClassBooster',
    };

    function stripResponse(obj) {
        const out = Array.isArray(obj) ? [...obj] : { ...obj };
        for (const key of STRIP_KEYS) {
            if (Object.prototype.hasOwnProperty.call(out, key)) delete out[key];
        }
        return out;
    }

    // Recursively remove `details` keys (localization/display data) from the
    // speciesBonuses.data.characterclasses entries.
    function stripDetailsDeep(obj) {
        if (Array.isArray(obj)) {
            return obj.map(stripDetailsDeep);
        }
        if (obj && typeof obj === 'object') {
            const out = {};
            for (const key of Object.keys(obj)) {
                if (key === 'details') continue;
                out[key] = stripDetailsDeep(obj[key]);
            }
            return out;
        }
        return obj;
    }

    // Fixed output shape per bonus type. The shape is a property of the type,
    // not of the data — it determines how the aggregated values are structured
    // regardless of how many entries or dims happen to be present.
    //
    //   'scalar'      → number                  (global, single dimension)
    //   'multiDim'    → { dim: number }         (global, multiple dimensions)
    //   'perEntry'    → { entryId: number }     (per entry, single dimension)
    //   'perEntryDim' → { entryId: { dim: number } } (per entry, multiple dims)
    //
    // 'Global' means the bonus type does not differentiate between entries
    // (e.g. ShipFuelConsumption applies to all ships equally). 'Per entry'
    // means the entryId carries meaning (e.g. CostReduction applies to a
    // specific research ID, BaseStatsBooster applies to a specific ship ID).
    const BONUS_TYPE_SHAPE = {
        Discoverer: 'scalar',
        ProductionBooster: 'perEntry',
        BaseStatsBooster: 'perEntryDim',
        CostReduction: 'perEntryDim',
        DenCapacityBooster: 'multiDim',
        ResearchSpeed: 'scalar',
        ShipFuelConsumption: 'scalar',
        CharacterClassBooster: 'perEntry',
        ImprovedCrawler: 'multiDim',
        FleetReturnDeuterium: 'scalar',
        PhalanxRangeBooster: 'scalar',
        ExpeditionBooster: 'scalar',
        ExpeditionFleetLossReduction: 'scalar',
        ExpeditionShipsFoundBooster: 'scalar',
        ExpeditionSpeedBooster: 'scalar',
        ExpeditionDMIncrease: 'scalar',
    };

    // Aggregate technologyBonus values by lifeform research bonus type.
    // The technologyBonus structure is:
    //   { planetId: { techId: { dim: val, quantity: N } } }
    // We sum across planets (same entry) but keep entries separate. The output
    // shape for each bonus type is fixed via BONUS_TYPE_SHAPE — it does not
    // adapt based on data content. Zero-value dimensions are stripped.
    function buildBonusByType(speciesData) {
        // Phase 1: aggregate — bonusType -> entryId -> dim -> sum(across planets)
        const agg = {};
        for (const category of Object.keys(speciesData)) {
            const catEntries = speciesData[category];
            for (const entryId of Object.keys(catEntries)) {
                const entry = catEntries[entryId];
                const techBonus = entry.technologyBonus;
                if (!techBonus || typeof techBonus !== 'object') continue;
                for (const planetId of Object.keys(techBonus)) {
                    const planetTechs = techBonus[planetId];
                    if (!planetTechs || typeof planetTechs !== 'object') continue;
                    for (const techId of Object.keys(planetTechs)) {
                        const bonusType = LIFEFORM_TECH_TYPE[parseInt(techId, 10)];
                        if (!bonusType) continue;
                        const dims = planetTechs[techId];
                        if (!agg[bonusType]) agg[bonusType] = {};
                        if (!agg[bonusType][entryId]) agg[bonusType][entryId] = {};
                        for (const dim of Object.keys(dims)) {
                            if (dim === 'quantity') continue;
                            const val = dims[dim];
                            if (typeof val !== 'number') continue;
                            agg[bonusType][entryId][dim] =
                                (agg[bonusType][entryId][dim] || 0) + val;
                        }
                    }
                }
            }
        }

        // Phase 2: strip zero dims, drop empty entries.
        const cleaned = {};
        for (const bonusType of Object.keys(agg)) {
            cleaned[bonusType] = {};
            for (const entryId of Object.keys(agg[bonusType])) {
                const dims = agg[bonusType][entryId];
                const nz = {};
                for (const dim of Object.keys(dims)) {
                    if (dims[dim] !== 0) nz[dim] = dims[dim];
                }
                if (Object.keys(nz).length > 0) cleaned[bonusType][entryId] = nz;
            }
        }

        // Phase 3: shape each bonus type according to its fixed structure.
        const result = {};
        for (const bonusType of Object.keys(cleaned)) {
            const entries = cleaned[bonusType];
            const entryIds = Object.keys(entries);
            if (entryIds.length === 0) continue;

            const shape = BONUS_TYPE_SHAPE[bonusType] || 'perEntryDim';

            if (shape === 'scalar') {
                // Global, single dim — all entries get the same value, so take
                // it from any entry (they should be identical).
                const firstEntry = entries[entryIds[0]];
                const dimKeys = Object.keys(firstEntry);
                result[bonusType] = dimKeys.length === 1
                    ? firstEntry[dimKeys[0]]
                    : firstEntry; // fallback to multiDim if somehow multiple
            } else if (shape === 'multiDim') {
                // Global, multiple dims — all entries get the same dims, so take
                // them from any entry.
                result[bonusType] = entries[entryIds[0]];
            } else if (shape === 'perEntry') {
                // Per entry, single dim — { entryId: value }.
                const out = {};
                for (const id of entryIds) {
                    const dimKeys = Object.keys(entries[id]);
                    out[id] = dimKeys.length === 1
                        ? entries[id][dimKeys[0]]
                        : entries[id]; // shouldn't happen, but keep dims if it does
                }
                result[bonusType] = out;
            } else {
                // perEntryDim — { entryId: { dim: value } }.
                result[bonusType] = entries;
            }
        }
        return result;
    }

    // Merge DOM-parsed data (name, coords, lifeform, diameter, fields, temperature)
    // into the matching entry inside `target` (keyed by string id).
    function mergeDomData(target, domEntries, isMoon) {
        if (!target) return;
        for (const entry of domEntries) {
            if (entry.id == null) continue;
            const id = String(entry.id);
            if (!Object.prototype.hasOwnProperty.call(target, id)) continue;
            const dest = target[id];
            if (entry.name != null) dest.name = entry.name;
            if (entry.diameter != null) dest.diameter = entry.diameter;
            if (entry.fieldsUsed != null || entry.fieldsTotal != null) {
                dest.fields = {
                    used: entry.fieldsUsed,
                    total: entry.fieldsTotal,
                };
            }
            // Planets have temperature; moons do not.
            if (!isMoon) {
                if (entry.tempMin != null || entry.tempMax != null) {
                    dest.temperature = {
                        min: entry.tempMin,
                        max: entry.tempMax,
                    };
                }
            }
        }
    }

    function buildExportObject(accountInfo, speciesBonuses, domPlanets, domMoons) {
        // 1. accountInfo is the base; strip transport-only fields.
        const exported = stripResponse(accountInfo);

        // 2. Merge DOM data into planets & moons (adds name, diameter, fields,
        //    temperature).
        mergeDomData(exported.planets, domPlanets, false);
        mergeDomData(exported.moons, domMoons, true);

        // 3. speciesBonuses: strip transport/localization fields, deep-strip
        //    `details`, then flatten (data is the only remaining key).
        const strippedSb = stripResponse(speciesBonuses);
        let bonusData = null;
        if (strippedSb.data) {
            bonusData = stripDetailsDeep(strippedSb.data);
            exported.speciesBonuses = bonusData;
        }

        // 4. Build simplified bonus-by-type lookup from the detailed technologyBonus data.
        if (bonusData) {
            exported.bonusByType = buildBonusByType(bonusData);
        }

        exported.schemaVersion = SCHEMA_VERSION;
        exported.exportedAt = new Date().toISOString();
        return exported;
    }

    async function exportData(statusEl) {
        statusEl.className = 'oe-status';
        statusEl.textContent = 'Fetching account info...';

        const baseUrl = '/game/index.php?page=componentOnly&component=externaldataexport';
        const accountInfo = await fetchJson(`${baseUrl}&action=accountInfo&asJson=1`);
        const speciesBonuses = await fetchJson(`${baseUrl}&action=speciesBonuses&asJson=1`);

        statusEl.textContent = 'Parsing planets from DOM...';
        const { planets, moons } = parsePlanetsFromDom();

        const exported = buildExportObject(accountInfo, speciesBonuses, planets, moons);

        statusEl.className = 'oe-status success';
        statusEl.textContent = 'Export complete!';
        return exported;
    }

    function downloadJson(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const playerName = data.playerName || 'ogame';
        a.href = url;
        a.download = `origin-export-${playerName}-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function copyJson(data, btn) {
        const text = JSON.stringify(data, null, 2);
        try {
            await navigator.clipboard.writeText(text);
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        } catch (e) {
            // fallback: select in textarea
            const ta = document.getElementById('origin-exporter-output');
            if (ta) {
                ta.style.display = 'block';
                ta.value = text;
                ta.select();
                document.execCommand('copy');
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500);
            }
        }
    }

    function openPopup() {
        if (document.getElementById(OVERLAY_ID)) return;

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;

        const popup = document.createElement('div');
        popup.id = POPUP_ID;
        popup.innerHTML = `
            <button class="oe-close" title="Close">&times;</button>
            <h2>Origin Exporter</h2>
            <p class="oe-desc">
                Exports your OGame account into a single JSON document. Uses the
                <code>accountInfo</code> endpoint as the base, merges in lifeform bonus data
                from the <code>speciesBonuses</code> endpoint, and augments each planet/moon
                with temperature, fields, diameter and lifeform parsed from the current page.
            </p>
            <div class="oe-actions">
                <button class="oe-primary" id="oe-export-btn">Export account data</button>
                <button id="oe-copy-btn" disabled>Copy JSON</button>
                <button id="oe-download-btn" disabled>Download JSON</button>
            </div>
            <div class="oe-status" id="oe-status"></div>
            <textarea id="origin-exporter-output" readonly></textarea>
        `;
        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const statusEl = popup.querySelector('#oe-status');
        const exportBtn = popup.querySelector('#oe-export-btn');
        const copyBtn = popup.querySelector('#oe-copy-btn');
        const downloadBtn = popup.querySelector('#oe-download-btn');
        const closeBtn = popup.querySelector('.oe-close');
        const outputTa = popup.querySelector('#origin-exporter-output');

        let exportedData = null;

        function closePopup() {
            document.body.removeChild(overlay);
        }

        closeBtn.addEventListener('click', closePopup);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePopup();
        });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') {
                closePopup();
                document.removeEventListener('keydown', esc);
            }
        });

        exportBtn.addEventListener('click', async () => {
            exportBtn.disabled = true;
            copyBtn.disabled = true;
            downloadBtn.disabled = true;
            try {
                exportedData = await exportData(statusEl);
                copyBtn.disabled = false;
                downloadBtn.disabled = false;
                outputTa.value = JSON.stringify(exportedData, null, 2);
            } catch (err) {
                statusEl.className = 'oe-status error';
                statusEl.textContent = 'Error: ' + (err && err.message ? err.message : err);
                console.error('[Origin Exporter]', err);
            } finally {
                exportBtn.disabled = false;
            }
        });

        copyBtn.addEventListener('click', () => {
            if (exportedData) copyJson(exportedData, copyBtn);
        });

        downloadBtn.addEventListener('click', () => {
            if (exportedData) downloadJson(exportedData);
        });
    }

    function attachClickHandler() {
        const empire = document.querySelector('.menuImage.empire');
        if (!empire) return false;
        if (empire.dataset.originExporterBound === '1') return true;
        empire.dataset.originExporterBound = '1';
        empire.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPopup();
        });
        return true;
    }

    function init() {
        injectStyles();
        if (!attachClickHandler()) {
            // Menu may load after our script; retry on DOM mutations for a while.
            const observer = new MutationObserver(() => {
                if (attachClickHandler()) observer.disconnect();
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => observer.disconnect(), 15000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
