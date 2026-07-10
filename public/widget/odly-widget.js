/**
 * Odly Chat Widget - Embeddable chat widget
 * Self-contained script that creates a floating chat UI
 */
(function () {
  'use strict';

  // Read configuration from the host page
  var cfg = window.OdlyChatWidget || {};
  var WIDGET_KEY = cfg.widgetKey;
  var API_URL = (cfg.apiUrl || '').replace(/\/+$/, '');

  if (!WIDGET_KEY || !API_URL) {
    console.error('[Odly Widget] Missing widgetKey or apiUrl in window.OdlyChatWidget');
    return;
  }

  // ─── State ───────────────────────────────────────────────────────────
  var sessionKey = localStorage.getItem('odly_session_' + WIDGET_KEY) || '';
  var widgetConfig = null;
  var messages = [];
  var isOpen = false;
  var isLoading = false;
  var userInfoCollected = false;
  var userName = '';
  var userEmail = '';

  // ─── Styles ──────────────────────────────────────────────────────────
  var STYLES = document.createElement('style');
  STYLES.textContent = [
    '#odly-widget-root *{box-sizing:border-box;margin:0;padding:0;font-family:var(--odly-font,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif)}',

    /* Container */
    '#odly-widget-root{position:fixed;z-index:2147483647;bottom:20px;right:20px}',
    '#odly-widget-root.odly-left{right:auto;left:20px}',

    /* Toggle button */
    '#odly-toggle{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.15);transition:transform .2s,box-shadow .2s}',
    '#odly-toggle:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.2)}',
    '#odly-toggle svg{width:28px;height:28px;fill:#fff}',

    /* Chat window */
    '#odly-chat{display:none;position:absolute;bottom:70px;right:0;width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);border-radius:var(--odly-radius,16px);overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.15);flex-direction:column;background:#fff}',
    '#odly-widget-root.odly-left #odly-chat{right:auto;left:0}',
    '#odly-chat.odly-open{display:flex}',

    /* Header */
    '#odly-header{padding:16px 20px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}',
    '#odly-header h3{font-size:16px;font-weight:600;color:#fff}',
    '#odly-header button{background:none;border:none;color:#fff;cursor:pointer;opacity:.8;font-size:20px;line-height:1;padding:4px}',
    '#odly-header button:hover{opacity:1}',

    /* Messages area */
    '#odly-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f9fafb}',

    /* Message bubbles */
    '.odly-msg{max-width:85%;padding:10px 14px;border-radius:var(--odly-radius,16px);font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}',
    '.odly-msg-user{align-self:flex-end;background:var(--odly-primary,#0070F3);color:#fff;border-bottom-right-radius:4px}',
    '.odly-msg-assistant{align-self:flex-start;background:var(--odly-bot-bubble,#fff);color:var(--odly-bot-text,#1f2937);border:1px solid #e5e7eb;border-bottom-left-radius:4px}',

    /* Typing indicator */
    '.odly-typing{align-self:flex-start;background:var(--odly-bot-bubble,#fff);border:1px solid #e5e7eb;padding:12px 18px;border-radius:16px;border-bottom-left-radius:4px;display:flex;gap:4px}',
    '.odly-typing span{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:odly-bounce .6s infinite alternate}',
    '.odly-typing span:nth-child(2){animation-delay:.2s}',
    '.odly-typing span:nth-child(3){animation-delay:.4s}',
    '@keyframes odly-bounce{to{opacity:.3;transform:translateY(-4px)}}',

    /* Input area */
    '#odly-input-area{padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;background:#fff;flex-shrink:0}',
    '#odly-input{flex:1;border:1px solid #d1d5db;border-radius:24px;padding:10px 16px;font-size:14px;outline:none;resize:none;max-height:80px;line-height:1.4}',
    '#odly-input:focus{border-color:var(--odly-primary,#0070F3);box-shadow:0 0 0 2px rgba(0,112,243,.15)}',
    '#odly-send{width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s}',
    '#odly-send:disabled{opacity:.4;cursor:default}',
    '#odly-send svg{width:18px;height:18px;fill:#fff}',

    /* User info form */
    '#odly-user-form{padding:20px;display:flex;flex-direction:column;gap:12px;background:#fff;flex:1;justify-content:center}',
    '#odly-user-form label{font-size:13px;color:#6b7280;font-weight:500}',
    '#odly-user-form input{border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:14px;outline:none;width:100%}',
    '#odly-user-form input:focus{border-color:var(--odly-primary,#0070F3);box-shadow:0 0 0 2px rgba(0,112,243,.15)}',
    '#odly-user-form button{border:none;color:#fff;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}',
    '#odly-user-form .odly-skip{background:none;color:#6b7280;font-size:13px;padding:4px;font-weight:400;text-decoration:underline}',

    /* Powered by */
    '#odly-footer{text-align:center;padding:6px;font-size:11px;color:#9ca3af;background:#fff;border-top:1px solid #f3f4f6}',
    '#odly-footer a{color:#9ca3af;text-decoration:none}',
    '#odly-footer a:hover{color:#6b7280}',

    /* Mobile responsive */
    '@media(max-width:440px){#odly-chat{width:calc(100vw - 20px);height:calc(100vh - 100px);bottom:66px;right:-10px}#odly-widget-root.odly-left #odly-chat{right:auto;left:-10px}}'
  ].join('\n');
  document.head.appendChild(STYLES);

  // ─── DOM ─────────────────────────────────────────────────────────────
  var root = document.createElement('div');
  root.id = 'odly-widget-root';

  // Toggle button
  var toggle = document.createElement('button');
  toggle.id = 'odly-toggle';
  toggle.setAttribute('aria-label', 'Open chat');
  toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>';

  // Chat window
  var chat = document.createElement('div');
  chat.id = 'odly-chat';

  root.appendChild(chat);
  root.appendChild(toggle);
  document.body.appendChild(root);

  // ─── Render helpers ──────────────────────────────────────────────────
  function setColor(color) {
    root.style.setProperty('--odly-primary', color);
    toggle.style.background = color;
  }

  function applyTheme(theme) {
    var t = theme || {};
    var radiusMap = { sharp: '6px', pill: '24px', rounded: '16px' };
    var radius = radiusMap[t.borderRadius] || '16px';
    root.style.setProperty('--odly-radius', radius);
    root.style.setProperty('--odly-bot-bubble', t.botBubbleColor || '#ffffff');
    root.style.setProperty('--odly-bot-text', t.botTextColor || '#1f2937');
    if (t.fontFamily) root.style.setProperty('--odly-font', t.fontFamily);
  }

  function renderChat() {
    var c = widgetConfig || {};
    var color = c.primaryColor || '#0070F3';
    setColor(color);
    applyTheme(c.theme || {});

    if (c.position === 'bottom-left') {
      root.classList.add('odly-left');
    }

    var showForm = c.collectUserInfo && !userInfoCollected && !sessionKey;

    chat.innerHTML = '';

    // Header
    var header = document.createElement('div');
    header.id = 'odly-header';
    header.style.background = color;
    header.innerHTML = '<h3>' + escapeHtml(c.name || 'Chat') + '</h3><button id="odly-close">&times;</button>';
    chat.appendChild(header);

    if (showForm) {
      renderUserForm(color);
    } else {
      renderMessages();
      renderInput(color);
    }

    // Footer
    var footer = document.createElement('div');
    footer.id = 'odly-footer';
    footer.innerHTML = 'Powered by <a href="https://odly.ai" target="_blank" rel="noopener">Odly</a>';
    chat.appendChild(footer);

    // Bind close
    document.getElementById('odly-close').onclick = function () { toggleChat(); };
  }

  function renderUserForm(color) {
    var form = document.createElement('div');
    form.id = 'odly-user-form';
    form.innerHTML =
      '<div style="text-align:center;margin-bottom:8px"><strong style="font-size:15px;color:#1f2937">Before we start</strong><p style="font-size:13px;color:#6b7280;margin-top:4px">Tell us a bit about yourself</p></div>' +
      '<div><label>Name</label><input type="text" id="odly-name" placeholder="Your name"></div>' +
      '<div><label>Email</label><input type="email" id="odly-email" placeholder="your@email.com"></div>' +
      '<button id="odly-start-btn" style="background:' + color + '">Start Chat</button>' +
      '<button class="odly-skip" id="odly-skip-btn">Skip</button>';
    chat.appendChild(form);

    // Bind
    setTimeout(function () {
      var startBtn = document.getElementById('odly-start-btn');
      var skipBtn = document.getElementById('odly-skip-btn');
      if (startBtn) startBtn.onclick = function () {
        userName = (document.getElementById('odly-name') || {}).value || '';
        userEmail = (document.getElementById('odly-email') || {}).value || '';
        userInfoCollected = true;
        renderChat();
      };
      if (skipBtn) skipBtn.onclick = function () {
        userInfoCollected = true;
        renderChat();
      };
    }, 0);
  }

  function renderMessages() {
    var area = document.createElement('div');
    area.id = 'odly-messages';

    // Welcome message
    if (widgetConfig && widgetConfig.welcomeMessage && messages.length === 0) {
      var welcome = document.createElement('div');
      welcome.className = 'odly-msg odly-msg-assistant';
      welcome.textContent = widgetConfig.welcomeMessage;
      area.appendChild(welcome);
    }

    messages.forEach(function (msg) {
      var el = document.createElement('div');
      el.className = 'odly-msg odly-msg-' + msg.role;
      el.textContent = msg.content;
      area.appendChild(el);
    });

    // Typing indicator
    if (isLoading) {
      var typing = document.createElement('div');
      typing.className = 'odly-typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      area.appendChild(typing);
    }

    chat.appendChild(area);

    // Scroll to bottom
    setTimeout(function () { area.scrollTop = area.scrollHeight; }, 10);
  }

  function renderInput(color) {
    var wrapper = document.createElement('div');
    wrapper.id = 'odly-input-area';
    wrapper.innerHTML =
      '<textarea id="odly-input" rows="1" placeholder="' + escapeHtml((widgetConfig && widgetConfig.placeholder) || 'Type a message...') + '"></textarea>' +
      '<button id="odly-send" style="background:' + color + '" ' + (isLoading ? 'disabled' : '') + '>' +
      '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>';
    chat.appendChild(wrapper);

    setTimeout(function () {
      var input = document.getElementById('odly-input');
      var sendBtn = document.getElementById('odly-send');
      if (!input || !sendBtn) return;

      // Auto-grow textarea
      input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 80) + 'px';
      });

      // Enter to send (shift+enter for newline)
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      sendBtn.onclick = sendMessage;

      // Focus input when chat opens
      input.focus();
    }, 0);
  }

  // ─── API calls ───────────────────────────────────────────────────────
  function fetchConfig() {
    fetch(API_URL + '/api/public/chat/' + WIDGET_KEY + '/config')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          widgetConfig = data.config;
          setColor(widgetConfig.primaryColor || '#0070F3');
          applyTheme(widgetConfig.theme || {});
          if (widgetConfig.position === 'bottom-left') {
            root.classList.add('odly-left');
          }
        }
      })
      .catch(function (err) {
        console.warn('[Odly Widget] Failed to fetch config:', err);
      });
  }

  function sendMessage() {
    var input = document.getElementById('odly-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text || isLoading) return;

    // Add user message
    messages.push({ role: 'user', content: text });
    isLoading = true;
    renderChat();

    // Build request body
    var body = { message: text };
    if (sessionKey) body.sessionKey = sessionKey;
    if (userName) body.userName = userName;
    if (userEmail) body.userEmail = userEmail;

    fetch(API_URL + '/api/public/chat/' + WIDGET_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        isLoading = false;
        if (data.success) {
          messages.push({ role: 'assistant', content: data.reply });
          if (data.sessionKey) {
            sessionKey = data.sessionKey;
            localStorage.setItem('odly_session_' + WIDGET_KEY, sessionKey);
          }
        } else {
          messages.push({
            role: 'assistant',
            content: data.error || 'Sorry, something went wrong. Please try again.',
          });
        }
        renderChat();
      })
      .catch(function (err) {
        isLoading = false;
        messages.push({
          role: 'assistant',
          content: 'Sorry, I could not connect to the server. Please try again later.',
        });
        renderChat();
        console.error('[Odly Widget] Send error:', err);
      });
  }

  // ─── Toggle ──────────────────────────────────────────────────────────
  function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
      chat.classList.add('odly-open');
      toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      renderChat();
    } else {
      chat.classList.remove('odly-open');
      toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>';
    }
  }

  toggle.onclick = toggleChat;

  // ─── Helpers ─────────────────────────────────────────────────────────
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Init ────────────────────────────────────────────────────────────
  fetchConfig();
})();
