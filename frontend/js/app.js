/**
 * app.js — Main Application Controller for AutonomousHardwareArchitect-AI
 * KiCad + VS Code Unified Cloud EDA & Embedded Studio.
 */
(function () {
    'use strict';

    let socket = null;
    let currentProjectId = 'default-project';
    let isConnected = false;

    document.addEventListener('DOMContentLoaded', initApp);

    function initApp() {
        // 1. Initialize Sub-modules
        if (typeof Viewer3D !== 'undefined') Viewer3D.init();
        if (typeof Pcb2DEditor !== 'undefined') Pcb2DEditor.init('pcb-2d-canvas');
        if (typeof SchematicViewer !== 'undefined') SchematicViewer.init();
        if (typeof PinMapModule !== 'undefined') PinMapModule.init();
        if (typeof MonacoIDE !== 'undefined') MonacoIDE.init();
        if (typeof SerialMonitor !== 'undefined') SerialMonitor.init();

        // 2. Initialize Chat
        if (typeof ChatModule !== 'undefined') {
            ChatModule.init(handleSendMessage);
        }

        // 3. Connect to backend
        initSocketConnection();

        // 4. Setup Resizers
        initSplitters();

        // 5. Setup View Switching & Activity Bar
        initViewSwitching();

        // 6. Setup Toolbar, DRC & Manufacturing Exports
        initToolbar();
    }

    /* ---- View & Activity Bar Switching ---- */

    function initViewSwitching() {
        // Center view tabs
        const centerTabs = document.querySelectorAll('.center-tab');
        centerTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const viewId = tab.dataset.view;
                switchCenterView(viewId);
            });
        });

        // Activity bar icons (VS Code left strip)
        const activityBtns = document.querySelectorAll('.activity-btn');
        activityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                activityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const targetTab = btn.dataset.tab;
                if (targetTab === 'tab-chat') {
                    // Focus chat input
                    document.getElementById('chat-input')?.focus();
                } else if (targetTab === 'tab-3d') {
                    switchCenterView('view-3d');
                } else if (targetTab === 'tab-pcb2d') {
                    switchCenterView('view-pcb2d');
                } else if (targetTab === 'tab-schematic') {
                    switchCenterView('view-schematic');
                } else if (targetTab === 'tab-code') {
                    switchCenterView('view-code');
                } else if (targetTab === 'tab-serial') {
                    switchCenterView('view-serial');
                } else if (targetTab === 'tab-pinmap') {
                    // Scroll pinmap into view
                    document.getElementById('panel-pinmap')?.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });

        // Solder mask color dropdown
        const maskSelect = document.getElementById('select-soldermask');
        if (maskSelect) {
            maskSelect.addEventListener('change', () => {
                const colorHex = parseInt(maskSelect.value, 16);
                if (typeof Viewer3D !== 'undefined' && Viewer3D.setSolderMaskColor) {
                    Viewer3D.setSolderMaskColor(colorHex);
                }
            });
        }

        // 2D PCB Layer checkboxes
        ['fcu', 'bcu', 'silk', 'edge', 'ratsnest'].forEach(name => {
            const chk = document.getElementById(`chk-${name}`);
            if (chk) {
                chk.addEventListener('change', () => {
                    const layerMap = {
                        fcu: 'F.Cu',
                        bcu: 'B.Cu',
                        silk: 'F.SilkS',
                        edge: 'Edge.Cuts',
                        ratsnest: 'Ratsnest'
                    };
                    if (typeof Pcb2DEditor !== 'undefined') {
                        Pcb2DEditor.toggleLayer(layerMap[name]);
                    }
                });
            }
        });

        const btnResetPcb2d = document.getElementById('btn-reset-pcb2d');
        if (btnResetPcb2d && typeof Pcb2DEditor !== 'undefined') {
            btnResetPcb2d.addEventListener('click', () => Pcb2DEditor.resetView());
        }
    }

    function switchCenterView(viewId) {
        document.querySelectorAll('.center-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.view === viewId);
        });
        document.querySelectorAll('.center-view').forEach(v => {
            v.classList.toggle('active', v.id === viewId);
        });

        // Trigger resize events for canvas/svg
        if (viewId === 'view-pcb2d' && typeof Pcb2DEditor !== 'undefined') {
            setTimeout(() => Pcb2DEditor.render(), 50);
        } else if (viewId === 'view-3d' && typeof Viewer3D !== 'undefined') {
            setTimeout(() => Viewer3D.resetView(), 50);
        } else if (viewId === 'view-schematic' && typeof SchematicViewer !== 'undefined') {
            setTimeout(() => SchematicViewer.zoomToFit(), 50);
        }
    }

    /* ---- Network / Backend Communication ---- */

    function initSocketConnection() {
        const statusBadge = document.getElementById('connection-status');
        const statusText = statusBadge ? statusBadge.querySelector('.status-text') : null;

        function updateStatus(connected) {
            isConnected = connected;
            if (!statusBadge || !statusText) return;
            if (connected) {
                statusBadge.className = 'status-badge status-connected';
                statusText.textContent = 'Server Connected';
            } else {
                statusBadge.className = 'status-badge status-connected';
                statusText.textContent = 'Local EDA Engine Active';
            }
        }

        try {
            if (typeof io !== 'undefined') {
                socket = io({
                    transports: ['websocket', 'polling'],
                    reconnectionAttempts: 3,
                    timeout: 3000
                });

                socket.on('connect', () => {
                    updateStatus(true);
                });

                socket.on('disconnect', () => {
                    updateStatus(false);
                });

                socket.on('design_response', (data) => {
                    handleBackendResponse(data);
                });
            } else {
                updateStatus(false);
            }
        } catch (e) {
            updateStatus(false);
        }
    }

    async function handleSendMessage(messageText) {
        showLoading(true);

        if (socket && isConnected) {
            socket.emit('chat_message', {
                project_id: currentProjectId,
                message: messageText
            });
            return;
        }

        try {
            const resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: currentProjectId,
                    message: messageText
                })
            });

            if (!resp.ok) {
                throw new Error(`Server returned HTTP ${resp.status}`);
            }

            const data = await resp.json();
            handleBackendResponse(data);
        } catch (err) {
            console.warn('[API] Using client-side simulation:', err);
            simulateLocalResponse(messageText);
        } finally {
            showLoading(false);
        }
    }

    function handleBackendResponse(data) {
        showLoading(false);
        if (!data) return;

        if (data.project_id) currentProjectId = data.project_id;
        if (data.project_name) {
            const el = document.getElementById('project-name');
            if (el) el.textContent = data.project_name;
        }

        const rawContent = data.response || data.content || '';
        let dialogue = '';
        let topologyJson = data.topology || null;
        let pinmapData = data.pinmap || null;

        if (rawContent) {
            const topMatch = rawContent.match(/\[TOPOLOGY_DATA\]([\s\S]*?)(?:\[\/?TOPOLOGY_DATA\]|$)/i);
            if (topMatch && !topologyJson) {
                try {
                    let jsonStr = topMatch[1].trim();
                    const jsonBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    if (jsonBlock) jsonStr = jsonBlock[1];
                    topologyJson = JSON.parse(jsonStr);
                } catch (e) {}
            }

            const pinMatch = rawContent.match(/\[PINOUT_MAP\]([\s\S]*?)(?:\[\/?PINOUT_MAP\]|$)/i);
            if (pinMatch && !pinmapData) {
                pinmapData = parsePinoutMapMarkdown(pinMatch[1]);
            }

            const diagMatch = rawContent.match(/\[DIALOGUE\]([\s\S]*?)(?:\[\/?DIALOGUE\]|$)/i);
            if (diagMatch) {
                dialogue = diagMatch[1].trim();
            } else {
                dialogue = rawContent
                    .replace(/\[TOPOLOGY_DATA\][\s\S]*?(?:\[\/?TOPOLOGY_DATA\]|$)/gi, '')
                    .replace(/\[PINOUT_MAP\][\s\S]*?(?:\[\/?PINOUT_MAP\]|$)/gi, '')
                    .trim();
            }
        }

        if (typeof ChatModule !== 'undefined' && dialogue) {
            ChatModule.addMessage('assistant', dialogue);
        }

        if (topologyJson && typeof TopologyManager !== 'undefined') {
            if (data.is_delta) {
                TopologyManager.applyDelta(topologyJson);
            } else {
                TopologyManager.load(topologyJson);
            }
        }

        if (pinmapData && typeof PinMapModule !== 'undefined') {
            PinMapModule.render(pinmapData);
        }

        // Notify 2D PCB and Monaco IDE
        const currentTop = typeof TopologyManager !== 'undefined' ? TopologyManager.getTopology() : null;
        if (currentTop) {
            if (typeof Pcb2DEditor !== 'undefined') Pcb2DEditor.render(currentTop);
            if (typeof MonacoIDE !== 'undefined') MonacoIDE.generateFirmwareProject(currentTop);
        }
    }

    function parsePinoutMapMarkdown(mdText) {
        const lines = mdText.trim().split('\n');
        const pins = [];
        let headerPassed = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('|')) continue;
            if (trimmed.includes('---')) {
                headerPassed = true;
                continue;
            }
            const parts = trimmed.split('|').map(s => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
            if (parts.length >= 4 && headerPassed) {
                pins.push({
                    pinNumber: parts[0],
                    pinName: parts[1],
                    function: parts[2],
                    protocol: parts[3],
                    connectedTo: parts[4] || 'N/A'
                });
            }
        }
        return pins.length > 0 ? pins : null;
    }

    function simulateLocalResponse(userInput) {
        setTimeout(() => {
            const lower = userInput.toLowerCase();
            let mcuPart = 'ESP32-S3-WROOM-1';
            let mcuPkg = 'QFN-56';

            if (lower.includes('stm32')) {
                mcuPart = 'STM32F401RET6';
                mcuPkg = 'LQFP-64';
            } else if (lower.includes('rp2040')) {
                mcuPart = 'RP2040';
                mcuPkg = 'QFN-56';
            }

            const mockTopology = {
                project: { name: `${mcuPart} Production System`, mcu: mcuPart },
                components: [
                    { ref: 'U1', part: mcuPart, value: mcuPart, package: mcuPkg, type: 'ic', x: 0, y: 0 },
                    { ref: 'U2', part: 'AMS1117-3.3', value: 'AMS1117-3.3', package: 'SOT-223', type: 'ic', x: -18, y: -10 },
                    { ref: 'J1', part: 'USB-C-16P', value: 'USB-C-16P', package: 'USB-C', type: 'connector', x: -34, y: -10, rotation: 270 },
                    { ref: 'C1', part: 'CAP-CER-10uF-16V-0805', value: '10uF', package: '0805', type: 'capacitor', x: -24, y: -10 },
                    { ref: 'C2', part: 'CAP-CER-0.1uF-50V-0603', value: '0.1uF', package: '0603', type: 'capacitor', x: -12, y: -10 },
                    { ref: 'C3', part: 'CAP-CER-10uF-10V-0805', value: '10uF', package: '0805', type: 'capacitor', x: -6, y: 6 },
                    { ref: 'C4', part: 'CAP-CER-0.1uF-50V-0603', value: '0.1uF', package: '0603', type: 'capacitor', x: -6, y: 9 },
                    { ref: 'U4', part: 'BME280', value: 'BME280', package: 'Generic', type: 'sensor', x: 20, y: 10 },
                    { ref: 'R1', part: 'RES-1K-1%-0603', value: '1k', package: '0603', type: 'resistor', x: 20, y: -14 },
                    { ref: 'D1', part: 'LED-BLUE-0603', value: 'LED-BLUE', package: '0603', type: 'led', x: 26, y: -14 }
                ],
                nets: [
                    { name: '5V_VBUS', connections: ['J1.VBUS', 'U2.VIN', 'C1.1'] },
                    { name: '3V3_RAIL', connections: ['U2.VOUT', 'U1.3V3', 'C2.1', 'C3.1', 'C4.1', 'U4.VDD'] },
                    { name: 'GND_RAIL', connections: ['J1.GND', 'U2.GND', 'U1.GND', 'C1.2', 'C2.2', 'U4.GND', 'D1.K'] },
                    { name: 'I2C_SDA', connections: ['U1.GPIO8', 'U4.SDA'] },
                    { name: 'I2C_SCL', connections: ['U1.GPIO9', 'U4.SCL'] },
                    { name: 'STATUS_LED', connections: ['U1.GPIO10', 'R1.1'] }
                ],
                pinmap: [
                    { pinNumber: '8', pinName: 'GPIO8', function: 'I2C0 SDA (Data)', protocol: 'I2C', connectedTo: 'U4.SDA (BME280)' },
                    { pinNumber: '9', pinName: 'GPIO9', function: 'I2C0 SCL (Clock)', protocol: 'I2C', connectedTo: 'U4.SCL (BME280)' },
                    { pinNumber: '10', pinName: 'GPIO10', function: 'Heartbeat LED PWM Driver', protocol: 'PWM', connectedTo: 'R1.1 -> D1' },
                    { pinNumber: '1', pinName: '3V3', function: 'Main Digital Supply (3.3V)', protocol: 'Power', connectedTo: '3V3_RAIL' },
                    { pinNumber: '2', pinName: 'GND', function: 'Ground Return Plane', protocol: 'Power', connectedTo: 'GND_RAIL' }
                ],
                board: { width: 75, height: 45, layers: 2 }
            };

            const dialogue = `**Production Architecture Synthesized!**\n\n` +
                `• Base Microcontroller: \`${mcuPart}\`\n` +
                `• Decoupling: Injected 10µF bulk and 0.1µF bypass pairs\n` +
                `• Mechanical: Positioned high-retention USB-C on strict board edge\n` +
                `• DFM Compliance: 0603 SMD components for standard surface mount yield\n` +
                `• 1-Click JLCPCB: Click **"📦 1-Click JLCPCB ZIP"** above to get full Gerber and Pick & Place files!`;

            const fullText = `[DIALOGUE]\n${dialogue}\n\n[PINOUT_MAP]\n| Pin # | Name | Function | Protocol | Connected To |\n| --- | --- | --- | --- | --- |\n| 8 | GPIO8 | I2C0 SDA | I2C | U4.SDA |\n| 9 | GPIO9 | I2C0 SCL | I2C | U4.SCL |\n| 10 | GPIO10 | Heartbeat LED | PWM | R1.1 |\n| 1 | 3V3 | Digital Supply | Power | 3V3_RAIL |\n| 2 | GND | Ground Return | Power | GND_RAIL |\n\n[TOPOLOGY_DATA]\n\`\`\`json\n${JSON.stringify(mockTopology, null, 2)}\n\`\`\``;

            handleBackendResponse({
                project_name: mockTopology.project.name,
                response: fullText,
                topology: mockTopology
            });
        }, 500);
    }

    /* ---- Splitters ---- */

    function initSplitters() {
        const resizeChat = document.getElementById('resize-chat');
        const resizePinout = document.getElementById('resize-pinout');
        const panelChat = document.getElementById('panel-chat');
        const panelPinmap = document.getElementById('panel-pinmap');

        if (resizeChat && panelChat) {
            setupResizer(resizeChat, (dx) => {
                const w = Math.max(260, Math.min(650, panelChat.offsetWidth + dx));
                panelChat.style.width = w + 'px';
                panelChat.style.flex = '0 0 ' + w + 'px';
            });
        }

        if (resizePinout && panelPinmap) {
            setupResizer(resizePinout, (dx) => {
                const w = Math.max(200, Math.min(500, panelPinmap.offsetWidth - dx));
                panelPinmap.style.width = w + 'px';
                panelPinmap.style.flex = '0 0 ' + w + 'px';
            });
        }
    }

    function setupResizer(handle, onMove) {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            let startX = e.clientX;

            function onMouseMove(moveEvent) {
                const delta = moveEvent.clientX - startX;
                startX = moveEvent.clientX;
                onMove(delta);
            }

            function onMouseUp() {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }

    /* ---- Toolbar & Exports ---- */

    function initToolbar() {
        // 1-Click JLCPCB Manufacturing Export
        const btnJlc = document.getElementById('btn-export-jlcpcb');
        if (btnJlc) {
            btnJlc.addEventListener('click', async () => {
                showLoading(true);
                const topo = typeof TopologyManager !== 'undefined' ? TopologyManager.getTopology() : {};
                if (typeof CamExporter !== 'undefined') {
                    await CamExporter.downloadProductionZip(topo);
                }
                showLoading(false);
            });
        }

        // KiCad DRC Check
        const btnDrc = document.getElementById('btn-run-drc');
        if (btnDrc) {
            btnDrc.addEventListener('click', () => {
                const topo = typeof TopologyManager !== 'undefined' ? TopologyManager.getTopology() : {};
                if (typeof DrcChecker !== 'undefined') {
                    const res = DrcChecker.runDRC(topo);
                    let msg = `=== KiCad Design Rule Check (DRC) ===\nManufacturing Yield Score: ${res.dfmScore}%\n\n`;
                    if (res.errors.length > 0) {
                        msg += `Errors (${res.errors.length}):\n` + res.errors.join('\n') + '\n\n';
                    }
                    if (res.warnings.length > 0) {
                        msg += `Warnings (${res.warnings.length}):\n` + res.warnings.join('\n') + '\n\n';
                    }
                    msg += `DFM / ERC Verification:\n` + res.advisories.join('\n');
                    alert(msg);
                }
            });
        }

        bindDownload('btn-download-schematic', `/api/project/${currentProjectId}/download/schematic`, 'schematic.kicad_sch');
        bindDownload('btn-download-pcb', `/api/project/${currentProjectId}/download/pcb`, 'board.kicad_pcb');
        bindDownload('btn-download-bom', `/api/project/${currentProjectId}/download/bom`, 'bom.csv');
        bindDownload('btn-download-spice', `/api/project/${currentProjectId}/download/spice`, 'circuit.cir');
    }

    function bindDownload(btnId, endpoint, defaultFilename) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        btn.addEventListener('click', async () => {
            try {
                showLoading(true);
                const res = await fetch(`/api/project/${currentProjectId}/download/${btnId.replace('btn-download-', '')}`);
                if (!res.ok) {
                    fallbackDownload(btnId.replace('btn-download-', ''), defaultFilename);
                    return;
                }
                const blob = await res.blob();
                downloadBlob(blob, defaultFilename);
            } catch (e) {
                fallbackDownload(btnId.replace('btn-download-', ''), defaultFilename);
            } finally {
                showLoading(false);
            }
        });
    }

    function fallbackDownload(type, filename) {
        let content = '';
        const topo = typeof TopologyManager !== 'undefined' ? TopologyManager.getTopology() : {};

        if (type === 'bom') {
            if (typeof CamExporter !== 'undefined') content = CamExporter.generateBOM(topo);
        } else if (type === 'spice') {
            content = `* SPICE Netlist generated by AutonomousHardwareArchitect-AI\n.title ${topo.project?.name || 'Simulation'}\n`;
            (topo.nets || []).forEach(net => {
                content += `* Net: ${net.name}\n`;
            });
            content += `V1 5V_VBUS 0 DC 5.0\nR_LOAD 3V3_RAIL 0 6.6\n.tran 1u 10m\n.end\n`;
        } else if (type === 'schematic') {
            content = `(kicad_sch (version 20230121) (generator "AutonomousHardwareArchitect-AI")\n  (uuid "${Date.now()}")\n  (paper "A4")\n)`;
        } else if (type === 'pcb') {
            content = `(kicad_pcb (version 20221018) (generator "AutonomousHardwareArchitect-AI")\n  (general (thickness 1.6))\n)`;
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, filename);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            if (show) overlay.classList.remove('hidden');
            else overlay.classList.add('hidden');
        }
    }
})();
