/**
 * schematic.js — SVG-based Schematic Renderer
 * Draws components as standard schematic symbols, wire connections,
 * labels with reference designators/values, and auto-layout.
 * Supports zoom and pan.
 */
const SchematicRenderer = (function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';

    /* ---- State ---- */
    let _svg, _container;
    let _viewBox = { x: -200, y: -150, w: 800, h: 600 };
    let _isDragging = false;
    let _dragStart = { x: 0, y: 0 };
    let _scale = 1;
    let _components = [];
    let _nets = [];

    /* ---- Symbol dimensions ---- */
    const SYMBOL_SIZE = {
        ic:        { w: 80, h: 100 },
        capacitor: { w: 30, h: 40 },
        resistor:  { w: 50, h: 16 },
        inductor:  { w: 50, h: 20 },
        diode:     { w: 30, h: 30 },
        led:       { w: 30, h: 30 },
        connector: { w: 40, h: 60 },
        crystal:   { w: 30, h: 40 },
        transistor:{ w: 40, h: 40 },
        fuse:      { w: 40, h: 12 },
        switch:    { w: 40, h: 20 },
        generic:   { w: 50, h: 40 }
    };

    /* ---- Init ---- */

    function init() {
        _container = document.getElementById('schematic-container');
        _svg       = document.getElementById('schematic-svg');
        if (!_svg || !_container) return;

        _svg.setAttribute('xmlns', SVG_NS);
        _updateViewBox();

        // Pan & Zoom
        _svg.addEventListener('mousedown', _onMouseDown);
        _svg.addEventListener('mousemove', _onMouseMove);
        _svg.addEventListener('mouseup', _onMouseUp);
        _svg.addEventListener('mouseleave', _onMouseUp);
        _svg.addEventListener('wheel', _onWheel, { passive: false });

        // Zoom-to-fit button
        document.getElementById('btn-zoom-fit-sch')?.addEventListener('click', zoomToFit);

        console.log('[Schematic] Renderer initialized');
    }

    /* ---- Update from topology ---- */

    function updateFromTopology(topology) {
        if (!_svg) return;

        // Clear
        while (_svg.firstChild) _svg.removeChild(_svg.firstChild);

        _components = topology.components || [];
        _nets = topology.nets || [];

        // Auto-layout if needed
        const layoutPositions = _autoLayout(_components);

        // Add defs for arrowheads, etc.
        _addDefs();

        // Draw grid background
        _drawGrid();

        // Draw wires first (behind components)
        _nets.forEach(net => {
            _drawNet(net, _components, layoutPositions);
        });

        // Draw components
        _components.forEach((comp, i) => {
            const pos = layoutPositions[i];
            _drawComponent(comp, pos.x, pos.y);
        });

        // Hide placeholder
        const placeholder = _container.querySelector('.viewer-placeholder');
        if (placeholder) placeholder.style.display = 'none';

        // Fit view
        zoomToFit();
    }

    /* ---- Defs ---- */

    function _addDefs() {
        const defs = _svgEl('defs');
        // Wire junction dot pattern
        const marker = _svgEl('marker', {
            id: 'arrowhead',
            markerWidth: '8',
            markerHeight: '6',
            refX: '8',
            refY: '3',
            orient: 'auto'
        });
        const arrowPath = _svgEl('path', {
            d: 'M0,0 L8,3 L0,6 Z',
            fill: '#00e5ff'
        });
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        _svg.appendChild(defs);
    }

    /* ---- Grid ---- */

    function _drawGrid() {
        const gridGroup = _svgEl('g', { class: 'sch-grid', opacity: '0.15' });
        const step = 20;
        const range = 600;
        for (let i = -range; i <= range; i += step) {
            gridGroup.appendChild(_svgEl('line', {
                x1: i, y1: -range, x2: i, y2: range,
                stroke: '#1a2233', 'stroke-width': '0.5'
            }));
            gridGroup.appendChild(_svgEl('line', {
                x1: -range, y1: i, x2: range, y2: i,
                stroke: '#1a2233', 'stroke-width': '0.5'
            }));
        }
        _svg.appendChild(gridGroup);
    }

    /* ---- Auto Layout ---- */

    function _autoLayout(components) {
        const positions = [];
        const count = components.length;
        if (count === 0) return positions;

        // Grid-based layout with type grouping
        const ics = [];
        const passives = [];
        const connectors = [];

        components.forEach((c, i) => {
            if (c.type === 'ic') ics.push(i);
            else if (['connector'].includes(c.type)) connectors.push(i);
            else passives.push(i);
        });

        // Place ICs in center column
        const icStartY = -(ics.length * 140) / 2;
        ics.forEach((idx, i) => {
            positions[idx] = { x: 0, y: icStartY + i * 160 };
        });

        // Place passives to the right
        const cols = Math.ceil(Math.sqrt(passives.length));
        passives.forEach((idx, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            positions[idx] = {
                x: 200 + col * 100,
                y: -((Math.ceil(passives.length / cols)) * 60) / 2 + row * 70
            };
        });

        // Place connectors to the left
        const connStartY = -(connectors.length * 100) / 2;
        connectors.forEach((idx, i) => {
            positions[idx] = { x: -200, y: connStartY + i * 100 };
        });

        // Fill any remaining without position
        components.forEach((c, i) => {
            if (!positions[i]) {
                positions[i] = { x: i * 80 - (count * 40), y: 300 };
            }
        });

        return positions;
    }

    /* ---- Draw Components ---- */

    function _drawComponent(comp, x, y) {
        const g = _svgEl('g', {
            class: 'sch-component',
            transform: `translate(${x}, ${y})`,
            'data-ref': comp.ref
        });

        const sym = SYMBOL_SIZE[comp.type] || SYMBOL_SIZE.generic;

        switch (comp.type) {
            case 'resistor':
                _drawResistor(g, sym);
                break;
            case 'capacitor':
                _drawCapacitor(g, sym);
                break;
            case 'inductor':
                _drawInductor(g, sym);
                break;
            case 'diode':
            case 'led':
                _drawDiode(g, sym, comp.type === 'led');
                break;
            case 'ic':
                _drawIC(g, comp, sym);
                break;
            case 'connector':
                _drawConnector(g, comp, sym);
                break;
            case 'crystal':
                _drawCrystal(g, sym);
                break;
            default:
                _drawGeneric(g, comp, sym);
                break;
        }

        // Reference designator
        g.appendChild(_svgText(comp.ref, 0, -sym.h / 2 - 12, 'sch-ref'));

        // Value
        g.appendChild(_svgText(comp.value, 0, sym.h / 2 + 14, 'sch-value'));

        _svg.appendChild(g);
    }

    function _drawResistor(g, sym) {
        // Zigzag resistor symbol
        const hw = sym.w / 2;
        // Lead wires
        g.appendChild(_svgEl('line', {
            x1: -hw - 15, y1: 0, x2: -hw, y2: 0,
            class: 'sch-wire'
        }));
        g.appendChild(_svgEl('line', {
            x1: hw, y1: 0, x2: hw + 15, y2: 0,
            class: 'sch-wire'
        }));
        // Zigzag body
        const zigzag = `M${-hw},0 L${-hw + 5},-8 L${-hw + 15},8 L${-hw + 25},-8 L${-hw + 35},8 L${-hw + 45},-8 L${hw},0`;
        g.appendChild(_svgEl('path', {
            d: zigzag,
            stroke: '#42a5f5',
            'stroke-width': '2',
            fill: 'none'
        }));
        // Pin dots
        g.appendChild(_svgEl('circle', { cx: -hw - 15, cy: 0, r: 2, class: 'sch-pin-dot' }));
        g.appendChild(_svgEl('circle', { cx: hw + 15, cy: 0, r: 2, class: 'sch-pin-dot' }));
    }

    function _drawCapacitor(g, sym) {
        const hh = sym.h / 2;
        // Lead wires (vertical orientation)
        g.appendChild(_svgEl('line', { x1: 0, y1: -hh - 15, x2: 0, y2: -4, class: 'sch-wire' }));
        g.appendChild(_svgEl('line', { x1: 0, y1: 4, x2: 0, y2: hh + 15, class: 'sch-wire' }));
        // Two plates
        g.appendChild(_svgEl('line', {
            x1: -10, y1: -4, x2: 10, y2: -4,
            stroke: '#8d6e63', 'stroke-width': '3'
        }));
        g.appendChild(_svgEl('line', {
            x1: -10, y1: 4, x2: 10, y2: 4,
            stroke: '#8d6e63', 'stroke-width': '3'
        }));
        // Pin dots
        g.appendChild(_svgEl('circle', { cx: 0, cy: -hh - 15, r: 2, class: 'sch-pin-dot' }));
        g.appendChild(_svgEl('circle', { cx: 0, cy: hh + 15, r: 2, class: 'sch-pin-dot' }));
    }

    function _drawInductor(g, sym) {
        const hw = sym.w / 2;
        // Lead wires
        g.appendChild(_svgEl('line', { x1: -hw - 15, y1: 0, x2: -hw, y2: 0, class: 'sch-wire' }));
        g.appendChild(_svgEl('line', { x1: hw, y1: 0, x2: hw + 15, y2: 0, class: 'sch-wire' }));
        // Arcs
        const arcs = `M${-hw},0 ` +
            `A5,5 0 0,1 ${-hw + 10},0 ` +
            `A5,5 0 0,1 ${-hw + 20},0 ` +
            `A5,5 0 0,1 ${-hw + 30},0 ` +
            `A5,5 0 0,1 ${-hw + 40},0 ` +
            `A5,5 0 0,1 ${hw},0`;
        g.appendChild(_svgEl('path', {
            d: arcs,
            stroke: '#66bb6a',
            'stroke-width': '2',
            fill: 'none'
        }));
        g.appendChild(_svgEl('circle', { cx: -hw - 15, cy: 0, r: 2, class: 'sch-pin-dot' }));
        g.appendChild(_svgEl('circle', { cx: hw + 15, cy: 0, r: 2, class: 'sch-pin-dot' }));
    }

    function _drawDiode(g, sym, isLed) {
        const hh = sym.h / 2;
        // Lead wires
        g.appendChild(_svgEl('line', { x1: 0, y1: -hh - 15, x2: 0, y2: -hh, class: 'sch-wire' }));
        g.appendChild(_svgEl('line', { x1: 0, y1: hh, x2: 0, y2: hh + 15, class: 'sch-wire' }));
        // Triangle
        g.appendChild(_svgEl('path', {
            d: `M-10,${-hh} L10,${-hh} L0,${hh - 4} Z`,
            stroke: isLed ? '#ffeb3b' : '#ab47bc',
            'stroke-width': '2',
            fill: 'none'
        }));
        // Bar
        g.appendChild(_svgEl('line', {
            x1: -10, y1: hh - 4, x2: 10, y2: hh - 4,
            stroke: isLed ? '#ffeb3b' : '#ab47bc',
            'stroke-width': '2'
        }));
        // LED arrows
        if (isLed) {
            g.appendChild(_svgEl('line', {
                x1: 10, y1: -8, x2: 18, y2: -16,
                stroke: '#ffeb3b', 'stroke-width': '1.5'
            }));
            g.appendChild(_svgEl('line', {
                x1: 14, y1: -4, x2: 22, y2: -12,
                stroke: '#ffeb3b', 'stroke-width': '1.5'
            }));
        }
        g.appendChild(_svgEl('circle', { cx: 0, cy: -hh - 15, r: 2, class: 'sch-pin-dot' }));
        g.appendChild(_svgEl('circle', { cx: 0, cy: hh + 15, r: 2, class: 'sch-pin-dot' }));
    }

    function _drawIC(g, comp, sym) {
        const pinCount = (comp.pins || []).length || 8;
        const pinsPerSide = Math.ceil(pinCount / 2);
        const h = Math.max(sym.h, pinsPerSide * 18 + 20);
        const w = sym.w;

        // Body rectangle
        g.appendChild(_svgEl('rect', {
            x: -w / 2,
            y: -h / 2,
            width: w,
            height: h,
            rx: 3,
            stroke: '#e0e0e0',
            'stroke-width': '2',
            fill: '#1a1a2e'
        }));

        // Notch
        g.appendChild(_svgEl('circle', {
            cx: -w / 2 + 8,
            cy: -h / 2 + 8,
            r: 3,
            stroke: '#e0e0e0',
            'stroke-width': '1',
            fill: 'none'
        }));

        // Draw pins
        const pins = comp.pins || [];
        const leftPins = pins.slice(0, pinsPerSide);
        const rightPins = pins.slice(pinsPerSide);

        leftPins.forEach((pin, i) => {
            const py = -h / 2 + 18 + i * 18;
            // Pin line
            g.appendChild(_svgEl('line', {
                x1: -w / 2 - 15, y1: py, x2: -w / 2, y2: py,
                class: 'sch-wire'
            }));
            // Pin dot
            g.appendChild(_svgEl('circle', { cx: -w / 2 - 15, cy: py, r: 2, class: 'sch-pin-dot' }));
            // Pin label
            g.appendChild(_svgText(
                typeof pin === 'string' ? pin : (pin.name || `P${i + 1}`),
                -w / 2 + 5, py + 3, 'sch-label', 'start', 9
            ));
        });

        rightPins.forEach((pin, i) => {
            const py = -h / 2 + 18 + i * 18;
            g.appendChild(_svgEl('line', {
                x1: w / 2, y1: py, x2: w / 2 + 15, y2: py,
                class: 'sch-wire'
            }));
            g.appendChild(_svgEl('circle', { cx: w / 2 + 15, cy: py, r: 2, class: 'sch-pin-dot' }));
            g.appendChild(_svgText(
                typeof pin === 'string' ? pin : (pin.name || `P${pinsPerSide + i + 1}`),
                w / 2 - 5, py + 3, 'sch-label', 'end', 9
            ));
        });
    }

    function _drawConnector(g, comp, sym) {
        const pinCount = (comp.pins || []).length || 4;
        const h = Math.max(sym.h, pinCount * 16 + 16);
        const w = sym.w;

        // Body
        g.appendChild(_svgEl('rect', {
            x: -w / 2,
            y: -h / 2,
            width: w,
            height: h,
            rx: 2,
            stroke: '#90a4ae',
            'stroke-width': '2',
            fill: '#263238'
        }));

        // Pins
        const pins = comp.pins || [];
        pins.forEach((pin, i) => {
            const py = -h / 2 + 12 + i * 16;
            g.appendChild(_svgEl('line', {
                x1: -w / 2 - 15, y1: py, x2: -w / 2, y2: py,
                class: 'sch-wire'
            }));
            g.appendChild(_svgEl('circle', { cx: -w / 2 - 15, cy: py, r: 2, class: 'sch-pin-dot' }));
            // Pin circle inside
            g.appendChild(_svgEl('circle', {
                cx: -w / 2 + 8, cy: py, r: 3,
                stroke: '#90a4ae', 'stroke-width': '1.5', fill: 'none'
            }));
            g.appendChild(_svgText(
                typeof pin === 'string' ? pin : (pin.name || `${i + 1}`),
                0, py + 3, 'sch-label', 'middle', 9
            ));
        });
    }

    function _drawCrystal(g, sym) {
        const hh = sym.h / 2;
        g.appendChild(_svgEl('line', { x1: 0, y1: -hh - 15, x2: 0, y2: -hh, class: 'sch-wire' }));
        g.appendChild(_svgEl('line', { x1: 0, y1: hh, x2: 0, y2: hh + 15, class: 'sch-wire' }));
        // Top plate
        g.appendChild(_svgEl('line', { x1: -8, y1: -hh, x2: 8, y2: -hh, stroke: '#00838f', 'stroke-width': '2' }));
        // Crystal body
        g.appendChild(_svgEl('rect', {
            x: -6, y: -hh + 4, width: 12, height: hh * 2 - 8,
            stroke: '#00838f', 'stroke-width': '2', fill: 'none'
        }));
        // Bottom plate
        g.appendChild(_svgEl('line', { x1: -8, y1: hh, x2: 8, y2: hh, stroke: '#00838f', 'stroke-width': '2' }));
        g.appendChild(_svgEl('circle', { cx: 0, cy: -hh - 15, r: 2, class: 'sch-pin-dot' }));
        g.appendChild(_svgEl('circle', { cx: 0, cy: hh + 15, r: 2, class: 'sch-pin-dot' }));
    }

    function _drawGeneric(g, comp, sym) {
        g.appendChild(_svgEl('rect', {
            x: -sym.w / 2,
            y: -sym.h / 2,
            width: sym.w,
            height: sym.h,
            rx: 3,
            stroke: '#78909c',
            'stroke-width': '2',
            fill: '#1c2333'
        }));
        g.appendChild(_svgText(comp.type || '?', 0, 4, 'sch-label', 'middle', 10));
    }

    /* ---- Draw Nets / Wires ---- */

    function _drawNet(net, components, layoutPositions) {
        if (!net.pins || net.pins.length < 2) return;

        const points = [];
        net.pins.forEach(pin => {
            const compIdx = components.findIndex(c => c.ref === pin.ref);
            if (compIdx !== -1 && layoutPositions[compIdx]) {
                points.push(layoutPositions[compIdx]);
            }
        });

        if (points.length < 2) return;

        // Determine wire color
        const wireColors = {
            SPI: '#42a5f5', I2C: '#66bb6a', UART: '#ffee58',
            Power: '#ef5350', GPIO: '#9e9e9e', ADC: '#ab47bc',
            PWM: '#ff7043', CAN: '#26c6da', USB: '#e040fb'
        };
        const color = wireColors[net.protocol] || '#00e5ff';

        // Draw polyline connections (Manhattan routing style)
        for (let i = 1; i < points.length; i++) {
            const from = points[0];
            const to = points[i];
            const midX = (from.x + to.x) / 2;

            // L-shaped routing
            const pathD = `M${from.x},${from.y} L${midX},${from.y} L${midX},${to.y} L${to.x},${to.y}`;
            const wire = _svgEl('path', {
                d: pathD,
                stroke: color,
                'stroke-width': '1.5',
                fill: 'none',
                opacity: '0.6',
                class: 'sch-wire'
            });
            _svg.appendChild(wire);
        }

        // Net label
        if (net.name && points.length >= 1) {
            const lp = points[0];
            _svg.appendChild(_svgText(net.name, lp.x, lp.y - 8, 'sch-label', 'middle', 8));
        }
    }

    /* ---- SVG Helpers ---- */

    function _svgEl(tag, attrs) {
        const el = document.createElementNS(SVG_NS, tag);
        if (attrs) {
            Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        }
        return el;
    }

    function _svgText(text, x, y, className, anchor, fontSize) {
        const el = _svgEl('text', {
            x, y,
            class: className || '',
            'text-anchor': anchor || 'middle',
            'font-size': fontSize || 11,
            'dominant-baseline': 'middle'
        });
        el.textContent = text;
        return el;
    }

    /* ---- Pan & Zoom ---- */

    function _onMouseDown(e) {
        if (e.button !== 0) return;
        _isDragging = true;
        _dragStart = { x: e.clientX, y: e.clientY };
        _svg.style.cursor = 'grabbing';
    }

    function _onMouseMove(e) {
        if (!_isDragging) return;
        const dx = (e.clientX - _dragStart.x) * _scale;
        const dy = (e.clientY - _dragStart.y) * _scale;
        _viewBox.x -= dx;
        _viewBox.y -= dy;
        _dragStart = { x: e.clientX, y: e.clientY };
        _updateViewBox();
    }

    function _onMouseUp() {
        _isDragging = false;
        if (_svg) _svg.style.cursor = 'default';
    }

    function _onWheel(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

        const rect = _svg.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;

        const newW = _viewBox.w * zoomFactor;
        const newH = _viewBox.h * zoomFactor;

        _viewBox.x += (_viewBox.w - newW) * mx;
        _viewBox.y += (_viewBox.h - newH) * my;
        _viewBox.w = newW;
        _viewBox.h = newH;
        _scale = _viewBox.w / (_container?.clientWidth || 800);

        _updateViewBox();
    }

    function _updateViewBox() {
        if (!_svg) return;
        _svg.setAttribute('viewBox', `${_viewBox.x} ${_viewBox.y} ${_viewBox.w} ${_viewBox.h}`);
    }

    function zoomToFit() {
        if (!_svg) return;
        const bbox = _svg.getBBox();
        if (bbox.width === 0 || bbox.height === 0) return;

        const pad = 60;
        _viewBox = {
            x: bbox.x - pad,
            y: bbox.y - pad,
            w: bbox.width + pad * 2,
            h: bbox.height + pad * 2
        };
        _scale = _viewBox.w / (_container?.clientWidth || 800);
        _updateViewBox();
    }

    /* ---- Expose ---- */
    return {
        init,
        updateFromTopology,
        zoomToFit
    };
})();
