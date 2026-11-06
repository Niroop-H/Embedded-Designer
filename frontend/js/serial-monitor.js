/**
 * serial-monitor.js — Virtual Hardware Serial Monitor & Testbench
 * Simulates real-time UART / Serial telemetry from the virtual microcontroller
 * and allows sending mock commands.
 */
const SerialMonitor = (function () {
    'use strict';

    let _terminalEl, _inputEl, _sendBtn, _clearBtn, _toggleBtn;
    let _telemetryInterval = null;
    let _isRunning = false;

    function init() {
        _terminalEl = document.getElementById('serial-terminal-output');
        _inputEl = document.getElementById('serial-input-text');
        _sendBtn = document.getElementById('btn-serial-send');
        _clearBtn = document.getElementById('btn-serial-clear');
        _toggleBtn = document.getElementById('btn-serial-toggle');

        if (_sendBtn && _inputEl) {
            _sendBtn.addEventListener('click', _handleSend);
            _inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') _handleSend();
            });
        }

        if (_clearBtn) {
            _clearBtn.addEventListener('click', () => {
                if (_terminalEl) _terminalEl.innerHTML = '';
            });
        }

        if (_toggleBtn) {
            _toggleBtn.addEventListener('click', toggleStream);
        }

        // Start simulated streaming
        startStream();
    }

    function log(message, type = 'info') {
        if (!_terminalEl) return;
        const line = document.createElement('div');
        line.className = `terminal-line terminal-${type}`;
        const time = new Date().toISOString().substring(11, 19);
        line.innerHTML = `<span style="color:#64748b; margin-right:8px;">[${time}]</span>${message}`;
        _terminalEl.appendChild(line);
        _terminalEl.scrollTop = _terminalEl.scrollHeight;
    }

    function _handleSend() {
        const text = _inputEl.value.trim();
        if (!text) return;
        log(`<span style="color:#00e5ff;">&gt; ${text}</span>`, 'input');
        _inputEl.value = '';

        setTimeout(() => {
            if (text.toLowerCase().includes('status') || text.toLowerCase().includes('help')) {
                log(`[AHA-SIM] MCU Status: RUNNING | Voltage: 3.31V | Current: 78.4mA | I2C: OK`, 'output');
            } else if (text.toLowerCase().includes('read')) {
                log(`[BME280] Temperature: 24.8°C | Humidity: 46.2% | Pressure: 1013.25 hPa`, 'output');
            } else {
                log(`[ACK] Command '${text}' executed successfully.`, 'output');
            }
        }, 200);
    }

    function startStream() {
        if (_isRunning) return;
        _isRunning = true;
        if (_toggleBtn) _toggleBtn.textContent = 'Pause Serial';

        log('[BOOT] Initializing MCU Core @ 240MHz...', 'info');
        log('[POWER] Checking 3.3V power rail: 3.308V (PASS)', 'info');
        log('[I2C0] Bus scanned: Device found at 0x76 (BME280)', 'info');

        _telemetryInterval = setInterval(() => {
            const temp = (23.5 + Math.random() * 2.0).toFixed(1);
            const current = (65 + Math.random() * 20).toFixed(1);
            log(`[TELEMETRY] Temp: ${temp}°C | Draw: ${current}mA | Free Heap: 284KB`, 'stream');
        }, 3000);
    }

    function pauseStream() {
        _isRunning = false;
        if (_telemetryInterval) clearInterval(_telemetryInterval);
        if (_toggleBtn) _toggleBtn.textContent = 'Resume Serial';
        log('[MONITOR] Serial data stream paused.', 'info');
    }

    function toggleStream() {
        if (_isRunning) pauseStream();
        else startStream();
    }

    return {
        init,
        log,
        startStream,
        pauseStream,
        toggleStream
    };
})();
