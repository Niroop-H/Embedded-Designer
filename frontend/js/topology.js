/**
 * topology.js — Topology Data Manager
 * Handles TOPOLOGY_DATA JSON parsing, component state tree,
 * delta updates, and distribution to viewer modules.
 */
const TopologyManager = (function () {
    'use strict';

    /* ---- Internal State ---- */
    let _topology = {
        project: { name: '', version: '', mcu: '' },
        components: [],   // { ref, value, package, type, pins:[], nets:[], x, y }
        nets: [],          // { name, pins:[{ref,pin}], protocol }
        pinmap: [],        // { pinNumber, pinName, function, protocol, connectedTo, altFunctions:[] }
        board: { width: 60, height: 40, layers: 2 }
    };

    const _listeners = { update: [], component: [], net: [], pinmap: [] };

    /* ---- Public API ---- */

    /** Reset topology to empty state */
    function reset() {
        _topology = {
            project: { name: '', version: '', mcu: '' },
            components: [],
            nets: [],
            pinmap: [],
            board: { width: 60, height: 40, layers: 2 }
        };
        _emit('update', _topology);
    }

    /** Parse and load a full TOPOLOGY_DATA JSON payload */
    function load(data) {
        if (!data) return;
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;

            if (parsed.project)    _topology.project    = { ..._topology.project, ...parsed.project };
            if (parsed.board)      _topology.board       = { ..._topology.board, ...parsed.board };
            if (parsed.components) _topology.components  = _normalizeComponents(parsed.components);
            if (parsed.nets)       _topology.nets        = parsed.nets;
            if (parsed.pinmap)     _topology.pinmap      = parsed.pinmap;

            _assignComponentPositions();
            _emit('update', _topology);
        } catch (e) {
            console.error('[Topology] Failed to parse TOPOLOGY_DATA:', e);
        }
    }

    /** Apply a delta/mutation to the existing topology */
    function applyDelta(delta) {
        if (!delta) return;
        try {
            const d = typeof delta === 'string' ? JSON.parse(delta) : delta;

            if (d.addComponents) {
                const normed = _normalizeComponents(d.addComponents);
                _topology.components.push(...normed);
                _assignComponentPositions();
            }
            if (d.removeComponents) {
                const refs = new Set(d.removeComponents);
                _topology.components = _topology.components.filter(c => !refs.has(c.ref));
            }
            if (d.updateComponent) {
                const upd = d.updateComponent;
                const comp = _topology.components.find(c => c.ref === upd.ref);
                if (comp) Object.assign(comp, upd);
            }
            if (d.addNets)    _topology.nets.push(...d.addNets);
            if (d.removeNets) {
                const names = new Set(d.removeNets);
                _topology.nets = _topology.nets.filter(n => !names.has(n.name));
            }
            if (d.pinmap) _topology.pinmap = d.pinmap;
            if (d.project) Object.assign(_topology.project, d.project);
            if (d.board)   Object.assign(_topology.board, d.board);

            _emit('update', _topology);
        } catch (e) {
            console.error('[Topology] Failed to apply delta:', e);
        }
    }

    /** Get current topology snapshot */
    function getTopology() {
        return JSON.parse(JSON.stringify(_topology));
    }

    /** Export topology as JSON string */
    function exportJSON() {
        return JSON.stringify(_topology, null, 2);
    }

    /** Subscribe to events: 'update', 'component', 'net', 'pinmap' */
    function on(event, callback) {
        if (_listeners[event]) _listeners[event].push(callback);
    }

    /** Get a component by reference designator */
    function getComponent(ref) {
        return _topology.components.find(c => c.ref === ref) || null;
    }

    /** Get all nets for a component */
    function getNetsForComponent(ref) {
        return _topology.nets.filter(n => n.pins && n.pins.some(p => p.ref === ref));
    }

    /* ---- Internal Helpers ---- */

    function _normalizeComponents(comps) {
        return comps.map(c => ({
            ref:     c.ref || c.reference || '',
            value:   c.value || '',
            package: c.package || c.footprint || 'Generic',
            type:    c.type || _inferType(c.ref || ''),
            pins:    c.pins || [],
            nets:    c.nets || [],
            x:       c.x ?? null,
            y:       c.y ?? null,
            z:       c.z ?? 0
        }));
    }

    function _inferType(ref) {
        const prefix = ref.replace(/[0-9]/g, '').toUpperCase();
        const map = {
            U: 'ic', IC: 'ic',
            C: 'capacitor',
            R: 'resistor',
            L: 'inductor',
            D: 'diode',
            J: 'connector', P: 'connector', CN: 'connector',
            Q: 'transistor',
            Y: 'crystal', X: 'crystal',
            F: 'fuse',
            SW: 'switch',
            LED: 'led'
        };
        return map[prefix] || 'generic';
    }

    function _assignComponentPositions() {
        // Simple grid-based auto-layout for components without positions
        const unplaced = _topology.components.filter(c => c.x === null);
        if (unplaced.length === 0) return;

        const cols = Math.ceil(Math.sqrt(unplaced.length));
        const spacingX = _topology.board.width / (cols + 1);
        const rows = Math.ceil(unplaced.length / cols);
        const spacingY = _topology.board.height / (rows + 1);

        unplaced.forEach((c, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            c.x = spacingX * (col + 1) - _topology.board.width / 2;
            c.y = spacingY * (row + 1) - _topology.board.height / 2;
        });
    }

    function _emit(event, data) {
        if (_listeners[event]) {
            _listeners[event].forEach(cb => {
                try { cb(data); } catch (e) { console.error('[Topology] Listener error:', e); }
            });
        }
    }

    /* ---- Expose ---- */
    return {
        reset,
        load,
        applyDelta,
        getTopology,
        exportJSON,
        on,
        getComponent,
        getNetsForComponent
    };
})();
