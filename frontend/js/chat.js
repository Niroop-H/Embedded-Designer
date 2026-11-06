/**
 * chat.js — Chat Interface Module
 * Handles message rendering, structured response parsing,
 * markdown rendering, typing indicators, and quick actions.
 */
const ChatModule = (function () {
    'use strict';

    /* ---- DOM References ---- */
    let _messagesEl, _inputEl, _sendBtn, _typingEl, _clearBtn;
    let _onSendCallback = null;
    let _messageHistory = [];

    /* ---- Initialization ---- */
    function init(onSendMessage) {
        _messagesEl = document.getElementById('chat-messages');
        _inputEl    = document.getElementById('chat-input');
        _sendBtn    = document.getElementById('btn-send');
        _typingEl   = document.getElementById('typing-indicator');
        _clearBtn   = document.getElementById('btn-clear-chat');
        _onSendCallback = onSendMessage;

        // Send on click
        _sendBtn.addEventListener('click', _handleSend);

        // Send on Enter (Shift+Enter for newline)
        _inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                _handleSend();
            }
        });

        // Auto-resize textarea
        _inputEl.addEventListener('input', _autoResize);

        // Clear chat
        _clearBtn.addEventListener('click', clearChat);

        // Quick prompt buttons
        document.querySelectorAll('.quick-prompt').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                if (prompt) {
                    _inputEl.value = prompt;
                    _handleSend();
                }
            });
        });
    }

    /* ---- Message Handling ---- */

    function _handleSend() {
        const text = _inputEl.value.trim();
        if (!text) return;

        addMessage('user', text);
        _inputEl.value = '';
        _inputEl.style.height = 'auto';

        if (_onSendCallback) _onSendCallback(text);
    }

    /** Add a message to the chat */
    function addMessage(role, content) {
        // Remove welcome message if it exists
        const welcome = _messagesEl.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const msgData = { role, content, timestamp: Date.now() };
        _messageHistory.push(msgData);

        const msgEl = document.createElement('div');
        msgEl.className = `chat-msg ${role}`;

        const header = document.createElement('div');
        header.className = 'chat-msg-header';

        const avatar = document.createElement('div');
        avatar.className = 'chat-msg-avatar';
        avatar.textContent = role === 'user' ? 'U' : 'AI';

        const time = document.createElement('span');
        time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        header.appendChild(avatar);
        header.appendChild(document.createTextNode(role === 'user' ? 'You' : 'Design Assistant'));
        header.appendChild(time);

        const bubble = document.createElement('div');
        bubble.className = 'chat-msg-bubble';

        if (role === 'user') {
            bubble.textContent = content;
        } else {
            bubble.innerHTML = _renderContent(content);
            _highlightCodeBlocks(bubble);
        }

        msgEl.appendChild(header);
        msgEl.appendChild(bubble);
        _messagesEl.appendChild(msgEl);

        _scrollToBottom();

        return msgEl;
    }

    /** Parse structured AI responses and extract data sections */
    function parseStructuredResponse(raw) {
        const result = {
            dialogue: '',
            topologyData: null,
            pinoutMap: null,
            rawSections: {}
        };

        // Extract [TOPOLOGY_DATA] ... [/TOPOLOGY_DATA]
        const topoMatch = raw.match(/\[TOPOLOGY_DATA\]([\s\S]*?)\[\/TOPOLOGY_DATA\]/);
        if (topoMatch) {
            try {
                result.topologyData = JSON.parse(topoMatch[1].trim());
            } catch (e) {
                console.warn('[Chat] Failed to parse TOPOLOGY_DATA:', e);
            }
        }

        // Extract [PINOUT_MAP] ... [/PINOUT_MAP]
        const pinMatch = raw.match(/\[PINOUT_MAP\]([\s\S]*?)\[\/PINOUT_MAP\]/);
        if (pinMatch) {
            try {
                result.pinoutMap = JSON.parse(pinMatch[1].trim());
            } catch (e) {
                console.warn('[Chat] Failed to parse PINOUT_MAP:', e);
            }
        }

        // Extract [DIALOGUE] ... [/DIALOGUE] or remaining text
        const dialogueMatch = raw.match(/\[DIALOGUE\]([\s\S]*?)\[\/DIALOGUE\]/);
        if (dialogueMatch) {
            result.dialogue = dialogueMatch[1].trim();
        } else {
            // Strip out data sections and use remaining text as dialogue
            result.dialogue = raw
                .replace(/\[TOPOLOGY_DATA\][\s\S]*?\[\/TOPOLOGY_DATA\]/g, '')
                .replace(/\[PINOUT_MAP\][\s\S]*?\[\/PINOUT_MAP\]/g, '')
                .replace(/\[DIALOGUE\]|\[\/DIALOGUE\]/g, '')
                .trim();
        }

        return result;
    }

    /** Render markdown content to HTML */
    function _renderContent(content) {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false
            });
            return marked.parse(content);
        }
        // Fallback: basic text escaping with line breaks
        return content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    }

    /** Apply syntax highlighting to code blocks in a container */
    function _highlightCodeBlocks(container) {
        if (typeof hljs === 'undefined') return;
        container.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    }

    /** Show typing indicator */
    function showTyping(text) {
        _typingEl.classList.remove('hidden');
        if (text) {
            _typingEl.querySelector('.typing-text').textContent = text;
        }
        _scrollToBottom();
    }

    /** Hide typing indicator */
    function hideTyping() {
        _typingEl.classList.add('hidden');
    }

    /** Clear chat history */
    function clearChat() {
        _messageHistory = [];
        _messagesEl.innerHTML = '';

        // Re-add welcome
        _messagesEl.innerHTML = `
            <div class="chat-welcome">
                <div class="welcome-icon">
                    <svg viewBox="0 0 48 48" width="48" height="48">
                        <rect x="4" y="10" width="40" height="28" rx="4" fill="none" stroke="#00e5ff" stroke-width="2"/>
                        <rect x="12" y="17" width="8" height="8" rx="1" fill="#00e5ff" opacity="0.5"/>
                        <rect x="28" y="17" width="8" height="8" rx="1" fill="#76ff03" opacity="0.5"/>
                        <line x1="20" y1="21" x2="28" y2="21" stroke="#ffd740" stroke-width="1.5"/>
                    </svg>
                </div>
                <h3>Hardware Design Assistant</h3>
                <p>Describe your embedded system requirements and I'll generate schematics, PCB layouts, and pin mappings.</p>
            </div>
        `;
    }

    /** Get message history */
    function getHistory() {
        return [..._messageHistory];
    }

    /* ---- Helpers ---- */

    function _autoResize() {
        _inputEl.style.height = 'auto';
        _inputEl.style.height = Math.min(_inputEl.scrollHeight, 120) + 'px';
    }

    function _scrollToBottom() {
        requestAnimationFrame(() => {
            _messagesEl.scrollTop = _messagesEl.scrollHeight;
        });
    }

    /* ---- Expose ---- */
    return {
        init,
        addMessage,
        parseStructuredResponse,
        showTyping,
        hideTyping,
        clearChat,
        getHistory
    };
})();
