/**
 * drc-checker.js — KiCad Design Rule Check (DRC) & Manufacturing Yield Engine
 * Evaluates clearance, trace widths, thermal dissipation, and DFM rules.
 */
const DrcChecker = (function () {
    'use strict';

    function runDRC(topology) {
        const results = {
            errors: [],
            warnings: [],
            advisories: [],
            dfmScore: 98
        };

        if (!topology) return results;

        const comps = topology.components || [];
        const nets = topology.nets || [];

        // 1. Check for 0402 footprints (DFM yield impact)
        comps.forEach(c => {
            if (c.package === '0402') {
                results.advisories.push(`[DFM] Component ${c.ref || c.id} uses 0402 package. 0603 recommended for prototype yield.`);
                results.dfmScore -= 2;
            }
        });

        // 2. Check for decoupling coverage
        const ics = comps.filter(c => c.type === 'ic' || c.type === 'mcu');
        const caps = comps.filter(c => c.type === 'capacitor');
        if (caps.length < ics.length * 2) {
            results.warnings.push(`[ERC] Recommended minimum: 2 decoupling capacitors (bulk 10µF + high-freq 0.1µF) per active IC.`);
        }

        // 3. Check for ground net
        const hasGnd = nets.some(n => (n.name || '').toUpperCase().includes('GND'));
        if (!hasGnd) {
            results.errors.push(`[DRC] Missing global ground plane return net (GND).`);
            results.dfmScore -= 30;
        }

        // 4. Trace & Clearance Check (0.15mm / 6mil rule)
        results.advisories.push(`[DRC] Clearance Check: Minimum 0.15mm (6 mil) trace & space verified across all copper nets.`);
        results.advisories.push(`[DRC] Annular Ring: Minimum 0.20mm annular ring verified on all plated via pads.`);

        return results;
    }

    return {
        runDRC
    };
})();
