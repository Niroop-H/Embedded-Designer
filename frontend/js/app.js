/**
 * app.js — Main Application Controller for AutonomousHardwareArchitect-AI
 * Initializes modules, manages panel resizing, communicates with FastAPI/Socket.IO backend,
 * and handles file downloads.
 */
(function () {
    'use strict';

    let socket = null;
    let currentProjectId = 'default-project';
    let isConnected = false;

    document.addEventListener('DOMContentLoaded', initApp);

    function initApp() {
        // 1. Initialize sub-modules
        if (typeof Viewer3D !== 'undefined') Viewer3D.init();
        if (typeof SchematicViewer !== 'undefined') SchematicViewer.init();
        if (typeof PinMapModule !== 'undefined') PinMapModule.init();

        // 2. Initialize Chat
        if (typeof ChatModule !== 'undefined') {
            ChatModule.init(handleSendMessage);
        }

        // 3. Connect to backend
        initSocketConnection();

        // 4. Setup Resizers
        initSplitters();

        // 5. Setup Toolbar & Downloads
        initToolbar();
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
                statusText.textContent = 'Connected';
            } else {
                statusBadge.className = 'status-badge status-disconnected';
                statusText.textContent = 'Local Mode';
            }
        }

        try {
            if (typeof io !== 'undefined') {
                socket = io({
                    transports: ['websocket', 'polling'],
                    reconnectionAttempts: 5,
                    timeout: 5000
                });

                socket.on('connect', () => {
                    console.log('[Socket] Connected to design server');
                    updateStatus(true);
                });

                socket.on('disconnect', () => {
                    console.log('[Socket] Disconnected from design server');
                    updateStatus(false);
                });

                socket.on('design_response', (data) => {
                    handleBackendResponse(data);
                });
            } else {
                updateStatus(false);
            }
        } catch (e) {
            console.warn('[Socket] Could not initialize socket.io:', e);
            updateStatus(false);
        }
    }

    async function handleSendMessage(messageText) {
        showLoading(true);

        // Try Socket.IO first if connected
        if (socket && isConnected) {
            socket.emit('chat_message', {
                project_id: currentProjectId,
                message: messageText
            });
            return;
        }

        // Fallback to HTTP REST endpoint
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
            console.error('[API] Error sending message:', err);
            // Local fallback simulation if server is offline
            simulateLocalResponse(messageText);
        } finally {
            showLoading(false);
        }
    }

    function handleBackendResponse(data) {
        showLoading(false);
        if (!data) return;

        if (data.project_id) {
            currentProjectId = data.project_id;
        }

        if (data.project_name) {
            const el = document.getElementById('project-name');
            if (el) el.textContent = data.project_name;
        }

        // 1. Process structured response text
        const rawContent = data.response || data.content || '';
        
        let dialogue = '';
        let topologyJson = null;
        let pinmapData = null;

        if (data.topology) {
            topologyJson = data.topology;
        }
        if (data.pinmap) {
            pinmapData = data.pinmap;
        }

        // Parse tags if embedded in text
        if (rawContent) {
            const topMatch = rawContent.match(/\[TOPOLOGY_DATA\]([\s\S]*?)(?:\[\/?TOPOLOGY_DATA\]|$)/i);
            if (topMatch && !topologyJson) {
                try {
                    // Extract json from markdown block if needed
                    let jsonStr = topMatch[1].trim();
                    const jsonBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    if (jsonBlock) jsonStr = jsonBlock[1];
                    topologyJson = JSON.parse(jsonStr);
                } catch (e) {
                    console.error('[App] Failed to parse TOPOLOGY_DATA from text:', e);
                }
            }

            const pinMatch = rawContent.match(/\[PINOUT_MAP\]([\s\S]*?)(?:\[\/?PINOUT_MAP\]|$)/i);
            if (pinMatch && !pinmapData) {
                pinmapData = parsePinoutMapMarkdown(pinMatch[1]);
            }

            // Extract dialogue
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

        // Render dialogue in chat
        if (typeof ChatModule !== 'undefined' && dialogue) {
            ChatModule.addMessage('assistant', dialogue);
        }

        // Load or delta topology
        if (topologyJson && typeof TopologyManager !== 'undefined') {
            if (data.is_delta) {
                TopologyManager.applyDelta(topologyJson);
            } else {
                TopologyManager.load(topologyJson);
            }
        }

        // Load pinmap if present
        if (pinmapData && typeof PinMapModule !== 'undefined') {
            PinMapModule.render(pinmapData);
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
            let msg = `[DIALOGUE]\nReceived command: "${userInput}". Analyzing requirements and checking component parameters...\n\n`;
            
            const lower = userInput.toLowerCase();
            if (lower.includes('esp32') || lower.includes('iot') || lower.includes('sensor')) {
                msg += `Detected ESP32 IoT request. Auto-configuring decoupling network, 3.3V LDO, and standard sensor peripherals.\n`;
                const mockTopology = {
                    project: { name: 'ESP32 IoT Node', mcu: 'ESP32-S3-WROOM-1' },
                    components: [
                        { ref: 'U1', value: 'ESP32-S3-WROOM-1', package: 'QFN-56', type: 'ic', x: 0, y: 0 },
                        { ref: 'U2', value: 'AMS1117-3.3', package: 'SOT-223', type: 'ic', x: -20, y: -10 },
                        { ref: 'C1', value: '10uF', package: '0805', type: 'capacitor', x: -28, y: -10 },
                        { ref: 'C2', value: '0.1uF', package: '0603', type: 'capacitor', x: -12, y: -10 },
                        { ref: 'J1', value: 'USB-C-16P', package: 'USB-C', type: 'connector', x: -35, y: -10 },
                        { ref: 'U3', value: 'BME280', package: 'LGA-8', type: 'sensor', x: 20, y: 10 },
                        { ref: 'D1', value: 'LED-BLUE', package: '0603', type: 'led', x: 25, y: -15 },
                        { ref: 'R1', value: '1k', package: '0603', type: 'resistor', x: 18, y: -15 }
                    ],
                    nets: [
                        { name: 'VBUS', pins: [{ref:'J1', pin:'VBUS'}, {ref:'U2', pin:'VIN'}] },
                        { name: '3V3', pins: [{ref:'U2', pin:'VOUT'}, {ref:'U1', pin:'3V3'}, {ref:'U3', pin:'VDD'}, {ref:'C2', pin:'1'}] },
                        { name: 'GND', pins: [{ref:'J1', pin:'GND'}, {ref:'U2', pin:'GND'}, {ref:'U1', pin:'GND'}, {ref:'C1', pin:'2'}, {ref:'C2', pin:'2'}, {ref:'U3', pin:'GND'}] },
                        { name: 'I2C_SDA', pins: [{ref:'U1', pin:'GPIO8'}, {ref:'U3', pin:'SDA'}] },
                        { name: 'I2C_SCL', pins: [{ref:'U1', pin:'GPIO9'}, {ref:'U3', pin:'SCL'}] },
                        { name: 'STATUS_LED', pins: [{ref:'U1', pin:'GPIO10'}, {ref:'R1', pin:'1'}] }
                    ],
                    pinmap: [
                        { pinNumber: '8', pinName: 'GPIO8', function: 'I2C SDA', protocol: 'I2C', connectedTo: 'U3.SDA' },
                        { pinNumber: '9', pinName: 'GPIO9', function: 'I2C SCL', protocol: 'I2C', connectedTo: 'U3.SCL' },
                        { pinNumber: '10', pinName: 'GPIO10', function: 'Status LED PWM', protocol: 'PWM', connectedTo: 'R1.1' },
                        { pinNumber: '1', pinName: '3V3', function: 'Main 3.3V Power', protocol: 'Power', connectedTo: '3V3 Rail' },
                        { pinNumber: '2', pinName: 'GND', function: 'System Ground', protocol: 'Power', connectedTo: 'GND Rail' }
                    ],
                    board: { width: 75, height: 45, layers: 2 }
                };

                msg += `\n[PINOUT_MAP]\n| Pin # | Name | Function | Protocol | Connected To |\n| --- | --- | --- | --- | --- |\n| 8 | GPIO8 | I2C SDA | I2C | U3.SDA |\n| 9 | GPIO9 | I2C SCL | I2C | U3.SCL |\n| 10 | GPIO10 | Status LED | PWM | R1.1 |\n| 1 | 3V3 | Power Rail | Power | 3V3_RAIL |\n| 2 | GND | System Ground | Power | GND_RAIL |\n\n`;
                msg += `[TOPOLOGY_DATA]\n\`\`\`json\n` + JSON.stringify(mockTopology, null, 2) + `\n\`\`\`\n`;
            } else {
                msg += `[DIALOGUE]\n**AutonomousHardwareArchitect-AI Protocol Activated**\n\nTo lock your design parameters accurately, let's proceed through the discovery sequence:\n\n1. **APPLICATION & FORM FACTOR**: What physical footprint limitations and operating environment do you target? (e.g., wearable 30x30mm, high-vibration drone, DIN rail industrial enclosure)?`;
            }

            handleBackendResponse({ response: msg, project_name: 'Embedded Project' });
        }, 600);
    }

    /* ---- Splitter / Resizing ---- */

    function initSplitters() {
        const resizeChat = document.getElementById('resize-chat');
        const resizeCenter = document.getElementById('resize-center');
        const resizePinout = document.getElementById('resize-pinout');

        const panelChat = document.getElementById('panel-chat');
        const panelCenter = document.getElementById('panel-center');
        const panelPinmap = document.getElementById('panel-pinmap');
        const panelViewer = document.getElementById('panel-viewer');
        const panelSchematic = document.getElementById('panel-schematic');

        // Horizontal resizing between Chat and Center
        if (resizeChat && panelChat) {
            setupResizer(resizeChat, (dx) => {
                const currentWidth = panelChat.offsetWidth;
                const newWidth = Math.max(260, Math.min(600, currentWidth + dx));
                panelChat.style.width = newWidth + 'px';
                panelChat.style.flex = '0 0 ' + newWidth + 'px';
            });
        }

        // Horizontal resizing between Center and Pinmap
        if (resizePinout && panelPinmap) {
            setupResizer(resizePinout, (dx) => {
                const currentWidth = panelPinmap.offsetWidth;
                const newWidth = Math.max(200, Math.min(500, currentWidth - dx));
                panelPinmap.style.width = newWidth + 'px';
                panelPinmap.style.flex = '0 0 ' + newWidth + 'px';
            });
        }

        // Vertical resizing inside Center (3D Viewer vs Schematic)
        if (resizeCenter && panelViewer && panelSchematic) {
            setupResizer(resizeCenter, (dx, dy) => {
                const currentH = panelViewer.offsetHeight;
                const newH = Math.max(150, Math.min(panelCenter.offsetHeight - 150, currentH + dy));
                panelViewer.style.height = newH + 'px';
                panelViewer.style.flex = '0 0 ' + newH + 'px';
            }, true);
        }
    }

    function setupResizer(handle, onMove, isVertical = false) {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            let startPos = isVertical ? e.clientY : e.clientX;

            function onMouseMove(moveEvent) {
                const currentPos = isVertical ? moveEvent.clientY : moveEvent.clientX;
                const delta = currentPos - startPos;
                startPos = currentPos;
                onMove(delta, delta);
            }

            function onMouseUp() {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }

    /* ---- Toolbar & File Downloads ---- */

    function initToolbar() {
        bindDownload('btn-download-schematic', `/api/project/${currentProjectId}/download/schematic`, 'schematic.kicad_sch');
        bindDownload('btn-download-pcb', `/api/project/${currentProjectId}/download/pcb`, 'board.kicad_pcb');
        bindDownload('btn-download-bom', `/api/project/${currentProjectId}/download/bom`, 'bom.csv');
        bindDownload('btn-download-spice', `/api/project/${currentProjectId}/download/spice`, 'circuit.cir');

        const btnSettings = document.getElementById('btn-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', () => {
                alert('AutonomousHardwareArchitect-AI v1.0.0\nReady for KiCad 7/8/9 native export and SPICE simulation.');
            });
        }
    }

    function bindDownload(btnId, endpoint, defaultFilename) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        btn.addEventListener('click', async () => {
            try {
                showLoading(true);
                const res = await fetch(`/api/project/${currentProjectId}/download/${btnId.replace('btn-download-', '')}`);
                if (!res.ok) {
                    // Generate client-side fallback if server file not generated yet
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
            content = 'Reference,Value,Package,Type\n';
            (topo.components || []).forEach(c => {
                content += `${c.ref || c.id || ''},${c.value || c.part || ''},${c.package || ''},${c.type || ''}\n`;
            });
        } else if (type === 'spice') {
            content = `* SPICE Netlist generated by AutonomousHardwareArchitect-AI\n.title ${topo.project?.name || 'Simulation'}\n`;
            (topo.nets || []).forEach((net, idx) => {
                content += `* Net ${net.name}\n`;
            });
            content += `.end\n`;
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
