/**
 * viewer3d.js — Three.js 3D PCB Viewer
 * Renders PCB board, components as 3D objects with correct dimensions,
 * trace connections, OrbitControls, and click-to-select with info popup.
 */
const Viewer3D = (function () {
    'use strict';

    /* ---- Three.js scene objects ---- */
    let _renderer, _scene, _camera, _controls;
    let _container, _canvas;
    let _raycaster, _mouse;
    let _boardGroup, _componentMeshes = [];
    let _traceLines = [];
    let _gridHelper, _axisHelper;
    let _selectedMesh = null;
    let _animFrameId = null;
    let _initialized = false;

    /* ---- Component dimension presets by package ---- */
    const PACKAGE_DIMS = {
        // { w, d, h } in mm (world units)
        'QFP-48':    { w: 9,  d: 9,  h: 1.2 },
        'QFP-64':    { w: 12, d: 12, h: 1.4 },
        'QFP-100':   { w: 14, d: 14, h: 1.6 },
        'QFP-144':   { w: 20, d: 20, h: 1.6 },
        'LQFP-48':   { w: 7,  d: 7,  h: 1.2 },
        'LQFP-64':   { w: 10, d: 10, h: 1.4 },
        'LQFP-100':  { w: 14, d: 14, h: 1.6 },
        'LQFP-144':  { w: 20, d: 20, h: 1.6 },
        'TQFP-32':   { w: 7,  d: 7,  h: 1.0 },
        'BGA-256':   { w: 17, d: 17, h: 1.7 },
        'QFN-32':    { w: 5,  d: 5,  h: 0.8 },
        'QFN-48':    { w: 7,  d: 7,  h: 0.8 },
        'SOIC-8':    { w: 5,  d: 4,  h: 1.5 },
        'SOIC-14':   { w: 9,  d: 4,  h: 1.5 },
        'SOIC-16':   { w: 10, d: 4,  h: 1.5 },
        'SOT-23':    { w: 2.9, d: 1.3, h: 1.0 },
        'SOT-223':   { w: 6.5, d: 3.5, h: 1.6 },
        '0402':      { w: 1,  d: 0.5, h: 0.4 },
        '0603':      { w: 1.6, d: 0.8, h: 0.5 },
        '0805':      { w: 2,  d: 1.25, h: 0.6 },
        '1206':      { w: 3.2, d: 1.6, h: 0.7 },
        '1210':      { w: 3.2, d: 2.5, h: 0.7 },
        'SMA':       { w: 4.3, d: 2.6, h: 2.3 },
        'USB-C':     { w: 8.9, d: 7.3, h: 3.3 },
        'USB-A':     { w: 12, d: 5.7, h: 4.5 },
        'RJ45':      { w: 16, d: 13.5, h: 11.5 },
        'Header-2x5':{ w: 5.1, d: 2.5, h: 8.5 },
        'Header-1x4':{ w: 10.2, d: 2.5, h: 8.5 },
        'Header-2x20':{ w: 50.8, d: 5.1, h: 8.5 },
        'Crystal':   { w: 5,  d: 3.2, h: 1.3 },
        'Generic':   { w: 4,  d: 3,  h: 1.5 }
    };

    /* ---- Component type → color ---- */
    const TYPE_COLORS = {
        ic:        0x263238,
        capacitor: 0x5D4037,
        resistor:  0x1565C0,
        inductor:  0x2E7D32,
        diode:     0x6A1B9A,
        led:       0xFFEB3B,
        connector: 0x90A4AE,
        crystal:   0x00838F,
        transistor:0x4E342E,
        fuse:      0xE65100,
        switch:    0x37474F,
        generic:   0x455A64
    };

    /* ---- Initialization ---- */

    function init() {
        _container = document.getElementById('viewer-3d-container');
        _canvas    = document.getElementById('viewer-3d-canvas');
        if (!_container || !_canvas) return;

        // Check if THREE is available
        if (typeof THREE === 'undefined') {
            console.warn('[3D] Three.js not loaded yet. Deferring init.');
            window.addEventListener('load', () => {
                if (typeof THREE !== 'undefined') _setup();
            });
            return;
        }
        _setup();
    }

    function _setup() {
        if (_initialized) return;
        _initialized = true;

        const w = _container.clientWidth;
        const h = _container.clientHeight;

        // Renderer
        _renderer = new THREE.WebGLRenderer({ canvas: _canvas, antialias: true, alpha: true });
        _renderer.setSize(w, h);
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.setClearColor(0x0d1117, 1);
        _renderer.shadowMap.enabled = true;
        _renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Scene
        _scene = new THREE.Scene();
        _scene.fog = new THREE.Fog(0x0d1117, 100, 250);

        // Camera
        _camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
        _camera.position.set(40, 50, 60);
        _camera.lookAt(0, 0, 0);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        _scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(30, 50, 40);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 200;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        _scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x4488ff, 0.2);
        fillLight.position.set(-20, 30, -20);
        _scene.add(fillLight);

        // Grid helper
        _gridHelper = new THREE.GridHelper(100, 50, 0x1a2233, 0x141a24);
        _gridHelper.position.y = -0.05;
        _scene.add(_gridHelper);

        // Axis helper
        _axisHelper = new THREE.AxesHelper(15);
        _axisHelper.position.y = 0.01;
        _scene.add(_axisHelper);

        // Board group
        _boardGroup = new THREE.Group();
        _scene.add(_boardGroup);

        // Orbit Controls
        if (typeof THREE.OrbitControls !== 'undefined') {
            _controls = new THREE.OrbitControls(_camera, _renderer.domElement);
        } else {
            // Try to set up basic controls later
            _controls = _createBasicControls(_camera, _renderer.domElement);
        }
        if (_controls) {
            _controls.enableDamping = true;
            _controls.dampingFactor = 0.08;
            _controls.minDistance = 10;
            _controls.maxDistance = 200;
            _controls.maxPolarAngle = Math.PI * 0.85;
        }

        // Raycaster for click detection
        _raycaster = new THREE.Raycaster();
        _mouse = new THREE.Vector2();

        // Events
        _canvas.addEventListener('click', _onCanvasClick);
        _canvas.addEventListener('mousemove', _onCanvasMouseMove);
        window.addEventListener('resize', _onResize);

        // Toolbar buttons
        document.getElementById('btn-reset-3d')?.addEventListener('click', resetView);
        document.getElementById('btn-toggle-grid')?.addEventListener('click', toggleGrid);

        // Start render loop
        _animate();

        // Hide placeholder
        const placeholder = _container.querySelector('.viewer-placeholder');
        if (placeholder) placeholder.style.display = 'none';

        console.log('[3D] Viewer initialized');
    }

    /* ---- Create a simple orbit-control fallback ---- */
    function _createBasicControls(camera, domElement) {
        // Minimal orbit controls fallback
        let isDragging = false;
        let prevX = 0, prevY = 0;
        let theta = 0.6, phi = 0.8, radius = 80;

        function updateCamera() {
            camera.position.x = radius * Math.sin(phi) * Math.cos(theta);
            camera.position.y = radius * Math.cos(phi);
            camera.position.z = radius * Math.sin(phi) * Math.sin(theta);
            camera.lookAt(0, 0, 0);
        }

        domElement.addEventListener('mousedown', (e) => {
            isDragging = true;
            prevX = e.clientX;
            prevY = e.clientY;
        });
        domElement.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - prevX;
            const dy = e.clientY - prevY;
            theta -= dx * 0.005;
            phi = Math.max(0.1, Math.min(Math.PI * 0.85, phi - dy * 0.005));
            prevX = e.clientX;
            prevY = e.clientY;
            updateCamera();
        });
        domElement.addEventListener('mouseup', () => isDragging = false);
        domElement.addEventListener('mouseleave', () => isDragging = false);
        domElement.addEventListener('wheel', (e) => {
            radius = Math.max(10, Math.min(200, radius + e.deltaY * 0.05));
            updateCamera();
        });

        updateCamera();

        return {
            enableDamping: false,
            dampingFactor: 0,
            minDistance: 10,
            maxDistance: 200,
            maxPolarAngle: Math.PI * 0.85,
            update() {}
        };
    }

    /* ---- Render Loop ---- */

    function _animate() {
        _animFrameId = requestAnimationFrame(_animate);
        if (_controls && _controls.update) _controls.update();
        _renderer.render(_scene, _camera);
    }

    /* ---- Scene Building ---- */

    /** Update the entire 3D scene from a topology object */
    function updateFromTopology(topology) {
        if (!_initialized) {
            _setup();
            if (!_initialized) return;
        }

        _clearScene();

        const board = topology.board || { width: 60, height: 40, layers: 2 };
        _createBoard(board.width, board.height, board.layers);

        // Add components
        if (topology.components) {
            topology.components.forEach(comp => {
                _addComponent(comp);
            });
        }

        // Add trace connections
        if (topology.nets) {
            topology.nets.forEach(net => {
                _addNetTrace(net, topology.components);
            });
        }

        // Show canvas, hide placeholder
        const placeholder = _container.querySelector('.viewer-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        _canvas.style.display = 'block';

        // Fit camera to board
        _fitCameraToBoard(board.width, board.height);
    }

    function _clearScene() {
        // Remove all component meshes
        _componentMeshes.forEach(m => {
            _boardGroup.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
                if (Array.isArray(m.material)) m.material.forEach(mt => mt.dispose());
                else m.material.dispose();
            }
        });
        _componentMeshes = [];

        // Remove trace lines
        _traceLines.forEach(l => {
            _boardGroup.remove(l);
            if (l.geometry) l.geometry.dispose();
            if (l.material) l.material.dispose();
        });
        _traceLines = [];

        // Remove board mesh
        while (_boardGroup.children.length > 0) {
            const child = _boardGroup.children[0];
            _boardGroup.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        }
    }

    function _createBoard(w, h, layers) {
        const thickness = 1.6; // standard PCB thickness

        // Board body
        const boardGeo = new THREE.BoxGeometry(w, thickness, h);
        const boardMat = new THREE.MeshPhongMaterial({
            color: _solderMaskColor || 0x0a5c2a,
            specular: 0x1a8a4a,
            shininess: 40,
            transparent: true,
            opacity: 0.95
        });
        const boardMesh = new THREE.Mesh(boardGeo, boardMat);
        _boardMesh = boardMesh;
        boardMesh.position.y = -thickness / 2;
        boardMesh.receiveShadow = true;
        boardMesh.userData = { type: 'board' };
        _boardGroup.add(boardMesh);

        // Silkscreen outline
        const outlineGeo = new THREE.EdgesGeometry(boardGeo);
        const outlineMat = new THREE.LineBasicMaterial({ color: 0x3ddc84, linewidth: 1 });
        const outline = new THREE.LineSegments(outlineGeo, outlineMat);
        outline.position.copy(boardMesh.position);
        _boardGroup.add(outline);

        // Mounting holes at corners
        const holeRadius = 1.5;
        const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, thickness + 0.1, 16);
        const holeMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
        const cornerOffsetX = w / 2 - 3;
        const cornerOffsetZ = h / 2 - 3;
        [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sz]) => {
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.position.set(sx * cornerOffsetX, -thickness / 2, sz * cornerOffsetZ);
            _boardGroup.add(hole);
        });
    }

    function _addComponent(comp) {
        const dims = _getComponentDims(comp.package);
        const color = TYPE_COLORS[comp.type] || TYPE_COLORS.generic;

        // Component body
        const geo = new THREE.BoxGeometry(dims.w, dims.h, dims.d);
        const mat = new THREE.MeshPhongMaterial({
            color: color,
            specular: 0x333333,
            shininess: 60
        });
        const mesh = new THREE.Mesh(geo, mat);

        // Position
        const x = comp.x || 0;
        const z = comp.y || 0;
        mesh.position.set(x, dims.h / 2, z);
        mesh.castShadow = true;

        // Store component data
        mesh.userData = {
            type: 'component',
            ref:  comp.ref,
            data: comp
        };

        // Add label on top for ICs
        if (comp.type === 'ic' && dims.w > 4) {
            _addComponentLabel(mesh, comp.ref, dims);
        }

        // Pin markers
        if (comp.pins && comp.pins.length > 0) {
            _addPinMarkers(mesh, comp, dims);
        }

        _boardGroup.add(mesh);
        _componentMeshes.push(mesh);
    }

    function _addComponentLabel(parentMesh, text, dims) {
        // Simple label using sprite
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, 128, 64);
        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(dims.w * 0.8, dims.d * 0.4, 1);
        sprite.position.set(0, dims.h / 2 + 0.5, 0);
        parentMesh.add(sprite);
    }

    function _addPinMarkers(parentMesh, comp, dims) {
        const pinCount = comp.pins.length;
        if (pinCount === 0) return;

        const pinGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const pinMat = new THREE.MeshPhongMaterial({ color: 0xC0C0C0, specular: 0xffffff, shininess: 100 });

        // Distribute pins along the edges
        const perSide = Math.ceil(pinCount / 4);
        comp.pins.forEach((pin, i) => {
            const side = Math.floor(i / perSide);
            const idx = i % perSide;
            const t = (idx + 0.5) / perSide - 0.5;

            let px = 0, pz = 0;
            switch (side % 4) {
                case 0: px = -dims.w / 2 - 0.5; pz = t * dims.d; break;  // left
                case 1: px = t * dims.w; pz = -dims.d / 2 - 0.5; break;  // bottom
                case 2: px = dims.w / 2 + 0.5; pz = t * dims.d; break;   // right
                case 3: px = t * dims.w; pz = dims.d / 2 + 0.5; break;   // top
            }

            const pinMesh = new THREE.Mesh(pinGeo, pinMat);
            pinMesh.position.set(px, 0, pz);
            parentMesh.add(pinMesh);
        });
    }

    function _addNetTrace(net, components) {
        if (!net.pins || net.pins.length < 2) return;

        // Get world positions of connected pins
        const positions = [];
        net.pins.forEach(pin => {
            const comp = components.find(c => c.ref === pin.ref);
            if (comp) {
                positions.push(new THREE.Vector3(
                    comp.x || 0,
                    1.5, // above board
                    comp.y || 0
                ));
            }
        });

        if (positions.length < 2) return;

        // Determine trace color by protocol
        const traceColorMap = {
            SPI:   0x42A5F5,
            I2C:   0x66BB6A,
            UART:  0xFFEE58,
            Power: 0xEF5350,
            GPIO:  0x9E9E9E,
            ADC:   0xAB47BC,
            PWM:   0xFF7043,
            CAN:   0x26C6DA,
            USB:   0xE040FB
        };
        const traceColor = traceColorMap[net.protocol] || 0x00E5FF;

        // Draw lines between each consecutive pair (star topology from first pin)
        const material = new THREE.LineBasicMaterial({
            color: traceColor,
            linewidth: 2,
            transparent: true,
            opacity: 0.7
        });

        for (let i = 1; i < positions.length; i++) {
            const geometry = new THREE.BufferGeometry().setFromPoints([positions[0], positions[i]]);
            const line = new THREE.Line(geometry, material);
            _boardGroup.add(line);
            _traceLines.push(line);
        }
    }

    function _getComponentDims(pkg) {
        if (!pkg) return PACKAGE_DIMS.Generic;
        // Try exact match
        if (PACKAGE_DIMS[pkg]) return PACKAGE_DIMS[pkg];
        // Try partial match
        for (const key in PACKAGE_DIMS) {
            if (pkg.toUpperCase().includes(key.toUpperCase())) return PACKAGE_DIMS[key];
        }
        return PACKAGE_DIMS.Generic;
    }

    function _fitCameraToBoard(w, h) {
        const maxDim = Math.max(w, h);
        const dist = maxDim * 1.5;
        _camera.position.set(dist * 0.6, dist * 0.8, dist * 0.6);
        _camera.lookAt(0, 0, 0);
        if (_controls && _controls.target) {
            _controls.target.set(0, 0, 0);
        }
    }

    /* ---- Interaction ---- */

    function _onCanvasClick(event) {
        _updateMouse(event);
        _raycaster.setFromCamera(_mouse, _camera);

        const intersects = _raycaster.intersectObjects(_componentMeshes, false);
        if (intersects.length > 0) {
            const mesh = intersects[0].object;
            _selectComponent(mesh);
        } else {
            _deselectComponent();
        }
    }

    function _onCanvasMouseMove(event) {
        _updateMouse(event);
        _raycaster.setFromCamera(_mouse, _camera);

        const intersects = _raycaster.intersectObjects(_componentMeshes, false);
        _canvas.style.cursor = intersects.length > 0 ? 'pointer' : 'default';

        // Hover highlight
        _componentMeshes.forEach(m => {
            if (m !== _selectedMesh) {
                m.material.emissive?.setHex(0x000000);
            }
        });
        if (intersects.length > 0 && intersects[0].object !== _selectedMesh) {
            intersects[0].object.material.emissive?.setHex(0x111111);
        }
    }

    function _updateMouse(event) {
        const rect = _canvas.getBoundingClientRect();
        _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function _selectComponent(mesh) {
        _deselectComponent();
        _selectedMesh = mesh;
        mesh.material.emissive?.setHex(0x1a3a2a);

        const data = mesh.userData.data;
        if (!data) return;

        // Show popup
        const popup    = document.getElementById('component-info-popup');
        const refEl    = document.getElementById('popup-ref');
        const bodyEl   = document.getElementById('popup-body');

        refEl.textContent = data.ref;

        const nets = TopologyManager.getNetsForComponent(data.ref);
        let netsHTML = nets.map(n =>
            `<div class="popup-row"><span class="popup-label">${n.name}</span><span class="popup-value">${n.protocol || ''}</span></div>`
        ).join('');

        bodyEl.innerHTML = `
            <div class="popup-row"><span class="popup-label">Value</span><span class="popup-value">${data.value}</span></div>
            <div class="popup-row"><span class="popup-label">Package</span><span class="popup-value">${data.package}</span></div>
            <div class="popup-row"><span class="popup-label">Type</span><span class="popup-value">${data.type}</span></div>
            <div class="popup-row"><span class="popup-label">Pins</span><span class="popup-value">${(data.pins || []).length}</span></div>
            ${netsHTML ? '<div style="margin-top:6px;font-weight:600;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Nets</div>' + netsHTML : ''}
        `;
        popup.classList.remove('hidden');
    }

    function _deselectComponent() {
        if (_selectedMesh) {
            _selectedMesh.material.emissive?.setHex(0x000000);
            _selectedMesh = null;
        }
        document.getElementById('component-info-popup')?.classList.add('hidden');
    }

    /* ---- Controls ---- */

    function resetView() {
        const topo = TopologyManager.getTopology();
        _fitCameraToBoard(topo.board.width, topo.board.height);
    }

    function toggleGrid() {
        if (_gridHelper) _gridHelper.visible = !_gridHelper.visible;
        if (_axisHelper) _axisHelper.visible = !_axisHelper.visible;
    }

    function _onResize() {
        if (!_container || !_renderer) return;
        const w = _container.clientWidth;
        const h = _container.clientHeight;
        _camera.aspect = w / h;
        _camera.updateProjectionMatrix();
        _renderer.setSize(w, h);
    }

    let _boardMesh = null;
    let _solderMaskColor = 0x0a5c2a;

    function setSolderMaskColor(colorHex) {
        _solderMaskColor = colorHex;
        if (_boardMesh && _boardMesh.material) {
            _boardMesh.material.color.setHex(colorHex);
        }
    }

    /* ---- Public API ---- */
    function destroy() {
        if (_animFrameId) cancelAnimationFrame(_animFrameId);
        window.removeEventListener('resize', _onResize);
        _canvas?.removeEventListener('click', _onCanvasClick);
        _canvas?.removeEventListener('mousemove', _onCanvasMouseMove);
        if (_renderer) _renderer.dispose();
    }

    /* ---- Popup close ---- */
    function _bindPopupClose() {
        document.getElementById('popup-close')?.addEventListener('click', _deselectComponent);
    }

    /* ---- Expose ---- */
    return {
        init() {
            init();
            _bindPopupClose();
        },
        updateFromTopology,
        setSolderMaskColor,
        resetView,
        toggleGrid,
        destroy
    };
})();
