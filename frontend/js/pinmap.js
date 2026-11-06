/**
 * pinmap.js — MCU Pinout Map Module
 * Renders interactive pinout map, protocol badges, multiplexing options modal,
 * and filtering.
 */
const PinMapModule = (function () {
    'use strict';

    let _container, _placeholder, _tableWrapper, _tbody, _filterSelect;
    let _muxModal, _muxTitle, _muxClose, _muxOptions;
    let _currentPinmap = [];

    function init() {
        _container    = document.getElementById('pinmap-container');
        _placeholder  = _container ? _container.querySelector('.viewer-placeholder') : null;
        _tableWrapper = document.getElementById('pinmap-table-wrapper');
        _tbody        = document.getElementById('pinmap-tbody');
        _filterSelect = document.getElementById('pinmap-filter');

        _muxModal   = document.getElementById('pin-mux-modal');
        _muxTitle   = document.getElementById('mux-pin-title');
        _muxClose   = document.getElementById('mux-close');
        _muxOptions = document.getElementById('mux-options');

        if (_filterSelect) {
            _filterSelect.addEventListener('change', () => {
                _renderTable(_filterSelect.value);
            });
        }

        if (_muxClose && _muxModal) {
            _muxClose.addEventListener('click', () => {
                _muxModal.classList.add('hidden');
            });
        }

        // Connect with TopologyManager if available
        if (typeof TopologyManager !== 'undefined') {
            TopologyManager.on('update', (top) => {
                if (top && top.pinmap && top.pinmap.length > 0) {
                    render(top.pinmap);
                } else {
                    clear();
                }
            });
        }
    }

    function render(pinmapData) {
        if (!pinmapData || pinmapData.length === 0) {
            clear();
            return;
        }

        _currentPinmap = pinmapData;
        if (_placeholder) _placeholder.classList.add('hidden');
        if (_tableWrapper) _tableWrapper.classList.remove('hidden');

        const filter = _filterSelect ? _filterSelect.value : 'all';
        _renderTable(filter);
    }

    function _renderTable(filter) {
        if (!_tbody) return;
        _tbody.innerHTML = '';

        const filtered = _currentPinmap.filter(p => {
            if (!filter || filter === 'all') return true;
            return (p.protocol && p.protocol.toUpperCase().includes(filter.toUpperCase())) ||
                   (p.function && p.function.toUpperCase().includes(filter.toUpperCase()));
        });

        if (filtered.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">No pins match filter "${filter}"</td>`;
            _tbody.appendChild(tr);
            return;
        }

        filtered.forEach(pin => {
            const tr = document.createElement('tr');
            tr.className = 'pin-row';
            tr.style.cursor = 'pointer';

            const protocolClass = _getProtocolClass(pin.protocol || 'GPIO');

            tr.innerHTML = `
                <td class="pin-num">${pin.pinNumber !== undefined ? pin.pinNumber : (pin.pin || '-')}</td>
                <td class="pin-name font-mono"><strong>${pin.pinName || pin.name || '-'}</strong></td>
                <td class="pin-fn">${pin.function || '-'}</td>
                <td class="pin-proto"><span class="badge ${protocolClass}">${pin.protocol || 'GPIO'}</span></td>
                <td class="pin-conn font-mono text-cyan">${pin.connectedTo || pin.net || '-'}</td>
            `;

            tr.addEventListener('click', () => {
                _showMuxModal(pin);
            });

            _tbody.appendChild(tr);
        });
    }

    function _getProtocolClass(protocol) {
        const proto = (protocol || '').toUpperCase();
        if (proto.includes('SPI')) return 'badge-spi';
        if (proto.includes('I2C')) return 'badge-i2c';
        if (proto.includes('UART')) return 'badge-uart';
        if (proto.includes('POWER') || proto.includes('VCC') || proto.includes('GND') || proto.includes('3V3') || proto.includes('5V')) return 'badge-power';
        if (proto.includes('ADC')) return 'badge-adc';
        if (proto.includes('PWM')) return 'badge-pwm';
        return 'badge-gpio';
    }

    function _showMuxModal(pin) {
        if (!_muxModal || !_muxOptions) return;

        if (_muxTitle) {
            _muxTitle.textContent = `Pin ${pin.pinNumber || ''} (${pin.pinName || pin.name || ''}) — Alternate Functions`;
        }

        _muxOptions.innerHTML = '';

        const altList = pin.altFunctions || pin.alternate_functions || [
            pin.function || 'General Purpose I/O',
            'ADC Channel',
            'PWM Output',
            'Interrupt / Wakeup Source'
        ];

        altList.forEach(func => {
            const opt = document.createElement('div');
            opt.className = 'mux-option-item';
            opt.style.padding = '8px 12px';
            opt.style.margin = '4px 0';
            opt.style.backgroundColor = 'var(--bg-tertiary, #252836)';
            opt.style.borderRadius = '4px';
            opt.style.fontSize = '12px';
            opt.style.display = 'flex';
            opt.style.justifyContent = 'space-between';
            opt.style.alignItems = 'center';

            const isCurrent = (pin.function && pin.function === func);
            opt.innerHTML = `
                <span>${func}</span>
                ${isCurrent ? '<span class="badge badge-success" style="font-size:10px;">ACTIVE</span>' : '<span style="color:var(--text-muted);font-size:10px;">Available</span>'}
            `;
            _muxOptions.appendChild(opt);
        });

        _muxModal.classList.remove('hidden');
    }

    function clear() {
        _currentPinmap = [];
        if (_tbody) _tbody.innerHTML = '';
        if (_tableWrapper) _tableWrapper.classList.add('hidden');
        if (_placeholder) _placeholder.classList.remove('hidden');
    }

    return {
        init,
        render,
        clear
    };
})();
