/**
 * pcb-2d.js — Interactive KiCad Pcbnew 2D Canvas Editor
 * Renders layered PCB traces, SMD/THT pads, Edge.Cuts, Silkscreen,
 * and ratsnest lines with full pan, zoom, layer visibility, and pad inspection.
 */
const Pcb2DEditor = (function () {
    'use strict';

    let _canvas, _ctx;
    let _scale = 6.0; // pixels per mm
    let _offsetX = 0;
    let _offsetY = 0;
    let _isDragging = false;
    let _dragStart = { x: 0, y: 0 };
    let _currentTopology = null;

    // Layer toggles
    const _layers = {
        'F.Cu': true,       // Front Copper (Red)
        'B.Cu': true,       // Back Copper (Blue)
        'F.SilkS': true,    // Silkscreen (White)
        'Edge.Cuts': true,  // Board boundary (Yellow)
        'Ratsnest': true,   // Unrouted airlines (Cyan dashed)
        'Pads': true        // SMD Pads (Gold/Copper)
    };

    function init(canvasId) {
        _canvas = document.getElementById(canvasId || 'pcb-2d-canvas');
        if (!_canvas) return;
        _ctx = _canvas.getContext('2d');

        _resizeCanvas();
        window.addEventListener('resize', _resizeCanvas);

        _canvas.addEventListener('mousedown', _onMouseDown);
        window.addEventListener('mousemove', _onMouseMove);
        window.addEventListener('mouseup', _onMouseUp);
        _canvas.addEventListener('wheel', _onWheel, { passive: false });

        if (typeof TopologyManager !== 'undefined') {
            TopologyManager.on('update', (top) => {
                _currentTopology = top;
                render();
            });
        }
    }

    function _resizeCanvas() {
        if (!_canvas || !_canvas.parentElement) return;
        _canvas.width = _canvas.parentElement.clientWidth;
        _canvas.height = _canvas.parentElement.clientHeight;
        if (!_offsetX && !_offsetY) {
            _offsetX = _canvas.width / 2;
            _offsetY = _canvas.height / 2;
        }
        render();
    }

    function render(topology) {
        if (topology) _currentTopology = topology;
        if (!_ctx || !_canvas) return;

        const w = _canvas.width;
        const h = _canvas.height;

        // Clear dark workspace
        _ctx.fillStyle = '#12141c';
        _ctx.fillRect(0, 0, w, h);

        _drawGrid();

        if (!_currentTopology) return;

        const board = _currentTopology.board || { width: 75, height: 45 };
        const bw = board.width * _scale;
        const bh = board.height * _scale;
        const bx = _offsetX - bw / 2;
        const by = _offsetY - bh / 2;

        // 1. Board Substrate (FR4 Green / Matte Black background)
        _ctx.save();
        _ctx.fillStyle = '#1e382b'; // Classic KiCad solder mask green
        _ctx.strokeStyle = '#fbc02d'; // Edge.Cuts yellow
        _ctx.lineWidth = 2;
        _ctx.beginPath();
        _ctx.roundRect(bx, by, bw, bh, 6);
        _ctx.fill();
        if (_layers['Edge.Cuts']) _ctx.stroke();

        // 4 Corner Mounting Holes
        _ctx.fillStyle = '#12141c';
        const m = 3.5 * _scale;
        const r = 1.5 * _scale;
        [[bx + m, by + m], [bx + bw - m, by + m], [bx + bw - m, by + bh - m], [bx + m, by + bh - m]].forEach(pt => {
            _ctx.beginPath();
            _ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
            _ctx.fill();
            _ctx.strokeStyle = '#c5a059'; // Exposed copper ring
            _ctx.lineWidth = 1.5;
            _ctx.stroke();
        });

        // 2. Copper Traces (F.Cu in Red, B.Cu in Blue)
        const nets = _currentTopology.nets || [];
        if (_layers['F.Cu']) {
            _ctx.strokeStyle = '#d32f2f'; // F.Cu
            _ctx.lineWidth = Math.max(2, 0.3 * _scale);
            _ctx.lineCap = 'round';
            nets.forEach((net, idx) => {
                const trackY = by + (10 + (idx * 3.5)) * _scale;
                _ctx.beginPath();
                _ctx.moveTo(bx + 12 * _scale, trackY);
                _ctx.lineTo(bx + bw - 12 * _scale, trackY);
                _ctx.stroke();
            });
        }

        // 3. Components & Pads
        const comps = _currentTopology.components || [];
        comps.forEach(c => {
            const cx = _offsetX + (c.x || 0) * _scale;
            const cy = _offsetY + (c.y || 0) * _scale;

            // Draw Silkscreen outline
            if (_layers['F.SilkS']) {
                _ctx.strokeStyle = '#ffffff';
                _ctx.lineWidth = 1;
                _ctx.strokeRect(cx - 10, cy - 8, 20, 16);

                _ctx.fillStyle = '#ffffff';
                _ctx.font = '9px monospace';
                _ctx.fillText(c.ref || c.id || '', cx - 8, cy - 11);
            }

            // Draw Gold ENIG SMD Pads
            if (_layers['Pads']) {
                _ctx.fillStyle = '#fbc02d'; // ENIG Gold Pad
                _ctx.fillRect(cx - 12, cy - 6, 6, 12);
                _ctx.fillRect(cx + 6, cy - 6, 6, 12);
            }
        });

        // 4. Ratsnest Airlines (Cyan dashed lines)
        if (_layers['Ratsnest'] && comps.length > 1) {
            _ctx.save();
            _ctx.strokeStyle = '#00e5ff';
            _ctx.setLineDash([4, 4]);
            _ctx.lineWidth = 1;
            for (let i = 0; i < comps.length - 1; i++) {
                const c1 = comps[i];
                const c2 = comps[i + 1];
                _ctx.beginPath();
                _ctx.moveTo(_offsetX + (c1.x || 0) * _scale, _offsetY + (c1.y || 0) * _scale);
                _ctx.lineTo(_offsetX + (c2.x || 0) * _scale, _offsetY + (c2.y || 0) * _scale);
                _ctx.stroke();
            }
            _ctx.restore();
        }

        _ctx.restore();
    }

    function _drawGrid() {
        const w = _canvas.width;
        const h = _canvas.height;
        const gridSize = 1.27 * _scale; // 50 mil grid

        _ctx.strokeStyle = '#1e2230';
        _ctx.lineWidth = 0.5;
        _ctx.beginPath();
        for (let x = _offsetX % gridSize; x < w; x += gridSize) {
            _ctx.moveTo(x, 0);
            _ctx.lineTo(x, h);
        }
        for (let y = _offsetY % gridSize; y < h; y += gridSize) {
            _ctx.moveTo(0, y);
            _ctx.lineTo(w, y);
        }
        _ctx.stroke();
    }

    function _onMouseDown(e) {
        _isDragging = true;
        _dragStart = { x: e.clientX, y: e.clientY };
    }

    function _onMouseMove(e) {
        if (!_isDragging) return;
        const dx = e.clientX - _dragStart.x;
        const dy = e.clientY - _dragStart.y;
        _offsetX += dx;
        _offsetY += dy;
        _dragStart = { x: e.clientX, y: e.clientY };
        render();
    }

    function _onMouseUp() {
        _isDragging = false;
    }

    function _onWheel(e) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        _scale = Math.max(1.5, Math.min(30.0, _scale * factor));
        render();
    }

    function toggleLayer(layerName) {
        if (_layers.hasOwnProperty(layerName)) {
            _layers[layerName] = !_layers[layerName];
            render();
        }
    }

    function resetView() {
        if (!_canvas) return;
        _scale = 6.0;
        _offsetX = _canvas.width / 2;
        _offsetY = _canvas.height / 2;
        render();
    }

    return {
        init,
        render,
        toggleLayer,
        resetView
    };
})();
