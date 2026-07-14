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
  // Contact details are collected conversationally (as chat bubbles), NOT via a
  // blocking pre-chat form — gated on the widget's `collectUserInfo` setting.
  // infoStep: null = not yet decided · 'name'/'email' = collecting · 'done' = chatting.
  var userName = '';
  var userEmail = '';
  var infoStep = null;
  // Human-handoff state. `escalated` hides the "Connect with our team" button
  // once the session has been handed to a human (via the button OR the bot's
  // own escalate tool). `escalateAfterInfo` marks that the current email step
  // was opened by the Connect button, so once we have (or skip) the email we
  // escalate instead of returning to normal chat.
  var escalated = false;
  var escalateAfterInfo = false;

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
    '#odly-messages{flex:1;overflow-y:auto;padding:20px 18px;display:flex;flex-direction:column;gap:12px;background:#f9fafb}',

    /* Message bubbles */
    // Scope under #odly-widget-root so this beats the `#odly-widget-root *{padding:0}`
    // reset (an ID selector, higher specificity than a bare `.odly-msg` class) —
    // otherwise the reset wins and bubble text renders flush to the edges.
    '#odly-widget-root .odly-msg{max-width:85%;padding:12px 18px;border-radius:var(--odly-radius,16px);font-size:14px;line-height:1.55;word-wrap:break-word;overflow-wrap:anywhere;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,.06)}',
    '.odly-msg-user{align-self:flex-end;background:var(--odly-primary,#0070F3);color:#fff;border-bottom-right-radius:4px}',
    '.odly-msg-assistant{align-self:flex-start;background:var(--odly-bot-bubble,#fff);color:var(--odly-bot-text,#1f2937);border:1px solid #e5e7eb;border-bottom-left-radius:4px}',
    '#odly-widget-root .odly-msg a{color:inherit;text-decoration:underline;font-weight:500}',

    /* Quick-action buttons (Skip / Connect with our team) */
    '#odly-widget-root .odly-actions{display:flex;flex-wrap:wrap;gap:8px;align-self:flex-start;margin-top:-2px}',
    '#odly-widget-root .odly-action-btn{cursor:pointer;border:1px solid var(--odly-primary,#0070F3);background:#fff;color:var(--odly-primary,#0070F3);border-radius:20px;padding:7px 14px;font-size:13px;font-weight:500;line-height:1;transition:background .15s,color .15s}',
    '#odly-widget-root .odly-action-btn:hover{background:var(--odly-primary,#0070F3);color:#fff}',

    /* Typing indicator */
    '#odly-widget-root .odly-typing{align-self:flex-start;background:var(--odly-bot-bubble,#fff);border:1px solid #e5e7eb;padding:12px 18px;border-radius:16px;border-bottom-left-radius:4px;display:flex;gap:4px}',
    '.odly-typing span{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:odly-bounce .6s infinite alternate}',
    '.odly-typing span:nth-child(2){animation-delay:.2s}',
    '.odly-typing span:nth-child(3){animation-delay:.4s}',
    '@keyframes odly-bounce{to{opacity:.3;transform:translateY(-4px)}}',

    /* Input area */
    '#odly-input-area{padding:14px 16px;border-top:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;background:#fff;flex-shrink:0}',
    '#odly-input{flex:1;border:1px solid #d1d5db;border-radius:24px;padding:10px 16px;font-size:14px;outline:none;resize:none;max-height:80px;line-height:1.4}',
    '#odly-input:focus{border-color:var(--odly-primary,#0070F3);box-shadow:0 0 0 2px rgba(0,112,243,.15)}',
    '#odly-send{width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s}',
    '#odly-send:disabled{opacity:.4;cursor:default}',
    '#odly-send svg{width:18px;height:18px;fill:#fff}',

    /* Powered by */
    '#odly-footer{text-align:center;padding:6px;font-size:11px;color:#9ca3af;background:#fff;border-top:1px solid #f3f4f6}',
    '#odly-footer a{color:#9ca3af;text-decoration:none}',
    '#odly-footer a:hover{color:#6b7280}',

    /* Mobile: go fullscreen so the panel can never clip off-screen (the old
       calc(100vw-20px) + right:-10px math overflowed the right edge, cutting off
       the input + send button on narrow viewports). position:fixed inset:0
       detaches it from the toggle's offset entirely. */
    '@media(max-width:440px){#odly-chat{position:fixed;top:0;left:0;right:0;bottom:0;width:auto;max-width:none;height:auto;max-height:none;border-radius:0}#odly-widget-root.odly-left #odly-chat{left:0;right:0}}'
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

    // Kick off in-chat contact collection once the config is known.
    startInfoCollectionIfNeeded();

    chat.innerHTML = '';

    // Header
    var header = document.createElement('div');
    header.id = 'odly-header';
    header.style.background = color;
    header.innerHTML = '<h3>' + escapeHtml(c.name || 'Chat') + '</h3><button id="odly-close">&times;</button>';
    chat.appendChild(header);

    renderMessages();
    renderInput(color);

    // Footer
    var footer = document.createElement('div');
    footer.id = 'odly-footer';
    footer.innerHTML = 'Powered by <a href="https://odly.ai" target="_blank" rel="noopener">Odly</a>';
    chat.appendChild(footer);

    // Bind close
    document.getElementById('odly-close').onclick = function () { toggleChat(); };
  }

  function renderMessages() {
    var area = document.createElement('div');
    area.id = 'odly-messages';

    // Welcome message
    if (widgetConfig && widgetConfig.welcomeMessage && messages.length === 0) {
      var welcome = document.createElement('div');
      welcome.className = 'odly-msg odly-msg-assistant';
      welcome.innerHTML = linkify(widgetConfig.welcomeMessage);
      area.appendChild(welcome);
    }

    messages.forEach(function (msg) {
      var el = document.createElement('div');
      el.className = 'odly-msg odly-msg-' + msg.role;
      el.innerHTML = linkify(msg.content);
      area.appendChild(el);
    });

    // Quick-action buttons for the current state (Skip during contact
    // collection; Connect with our team during normal chat).
    var actions = currentActions();
    if (actions.length) {
      var actRow = document.createElement('div');
      actRow.className = 'odly-actions';
      actions.forEach(function (a) {
        var b = document.createElement('button');
        b.className = 'odly-action-btn';
        b.textContent = a.label;
        b.onclick = function () { handleAction(a.id); };
        actRow.appendChild(b);
      });
      area.appendChild(actRow);
    }

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
      '<button id="odly-send" ' + (isLoading ? 'disabled' : '') + '>' +
      '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>';
    chat.appendChild(wrapper);

    setTimeout(function () {
      var input = document.getElementById('odly-input');
      var sendBtn = document.getElementById('odly-send');
      if (!input || !sendBtn) return;
      // Set the accent via DOM (never string-interpolate config into HTML — avoids
      // attribute-injection if primaryColor is ever a hostile value).
      sendBtn.style.background = color;

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
          // If the visitor already opened the chat before config arrived, re-render
          // so the welcome + contact-collection flow appears.
          if (isOpen) renderChat();
        }
      })
      .catch(function (err) {
        console.warn('[Odly Widget] Failed to fetch config:', err);
      });
  }

  function isValidEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  // Decide (once, after config loads) whether to collect name/email in-chat. Seeds
  // the first assistant bubble with the welcome + the name question when enabled.
  function startInfoCollectionIfNeeded() {
    if (infoStep !== null || !widgetConfig) return; // wait until config is loaded
    // Collect name/email at the start of EVERY new conversation (a fresh chat with
    // no messages yet), not just once per visitor. Any persisted session is from a
    // previous conversation, so drop it: the collected details then attach to a
    // brand-new session created by the first message, rather than reopening the old one.
    if (widgetConfig.collectUserInfo && messages.length === 0) {
      if (sessionKey) {
        sessionKey = '';
        try {
          localStorage.removeItem('odly_session_' + WIDGET_KEY);
        } catch (e) {
          /* localStorage unavailable — non-fatal */
        }
      }
      userName = '';
      userEmail = '';
      infoStep = 'name';
      messages.push({
        role: 'assistant',
        content: widgetConfig.welcomeMessage || 'Hi! How can I help you today?',
      });
      messages.push({ role: 'assistant', content: 'To get started, may I have your name?' });
    } else {
      infoStep = 'done';
    }
  }

  function sendMessage() {
    var input = document.getElementById('odly-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text || isLoading) return;

    // ── In-chat contact collection (handled locally, no API call) ──
    // Typing "skip" is still honored alongside the Skip button (empty = skip).
    if (infoStep === 'name') {
      submitName(text.toLowerCase() === 'skip' ? '' : text);
      return;
    }
    if (infoStep === 'email') {
      submitEmail(text.toLowerCase() === 'skip' ? '' : text);
      return;
    }

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
          // The bot may hand off to a human on its own (escalate_to_human tool);
          // hide the Connect button when it does.
          if (data.escalated) escalated = true;
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

  // ─── Contact collection + human handoff ──────────────────────────────
  // Which quick-action buttons to show for the current state. Org-agnostic:
  // the Connect label defaults to a generic phrase (any org's widget uses it),
  // overridable via widgetConfig.humanHandoffLabel if the backend supplies one.
  function currentActions() {
    if (isLoading) return [];
    if (infoStep === 'name' || infoStep === 'email') return [{ id: 'skip', label: 'Skip' }];
    // Connect needs a live session (created on the first real message) and only
    // shows until the conversation is handed off.
    if (infoStep === 'done' && sessionKey && !escalated) {
      var label = (widgetConfig && widgetConfig.humanHandoffLabel) || 'Connect with our team';
      return [{ id: 'connect', label: label }];
    }
    return [];
  }

  function handleAction(id) {
    if (id === 'skip') {
      if (infoStep === 'name') submitName('');
      else if (infoStep === 'email') submitEmail('');
    } else if (id === 'connect') {
      requestConnect();
    }
  }

  // Empty text = skipped.
  function submitName(text) {
    messages.push({ role: 'user', content: text || 'Skip' });
    if (text) userName = text;
    messages.push({
      role: 'assistant',
      content: (userName ? 'Thanks, ' + userName + '! ' : '') + 'What’s your email? (or tap Skip)',
    });
    infoStep = 'email';
    renderChat();
  }

  // Empty text = skipped; a non-empty invalid value re-prompts on the email step.
  function submitEmail(text) {
    if (text === '') {
      messages.push({ role: 'user', content: 'Skip' });
      userEmail = '';
      finishInfo();
      return;
    }
    messages.push({ role: 'user', content: text });
    if (isValidEmail(text)) {
      userEmail = text;
      finishInfo();
    } else {
      messages.push({
        role: 'assistant',
        content: 'Hmm, that doesn’t look like a valid email — mind re-entering it? (or tap Skip)',
      });
      renderChat(); // stay on the 'email' step
    }
  }

  // Wrap up contact collection. If the email step was opened by the Connect
  // button, hand off now; otherwise fall back into normal chat.
  function finishInfo() {
    infoStep = 'done';
    if (escalateAfterInfo) {
      escalateAfterInfo = false;
      if (userEmail) {
        renderChat();
        doEscalate();
      } else {
        // No email → don't create a thread the team has no way to reply to.
        // Cancel the handoff and keep chatting; the Connect button stays visible.
        messages.push({
          role: 'assistant',
          content:
            'No problem — I can keep helping here. If you’d like a teammate to follow up, just share your email anytime.',
        });
        renderChat();
      }
    } else {
      messages.push({
        role: 'assistant',
        content: userEmail ? 'Thanks! How can I help you today?' : 'No problem — how can I help you today?',
      });
      renderChat();
    }
  }

  // "Connect with our team": escalate straight away when we already have an
  // email, otherwise collect one first (Skip allowed) then escalate.
  function requestConnect() {
    if (!sessionKey || escalated || isLoading) return;
    if (userEmail) {
      doEscalate();
    } else {
      escalateAfterInfo = true;
      infoStep = 'email';
      messages.push({
        role: 'assistant',
        content: 'Sure — what’s the best email for our team to reach you? (or tap Skip)',
      });
      renderChat();
    }
  }

  // Deterministic handoff via the public escalate endpoint. Idempotent server-side.
  function doEscalate() {
    if (!sessionKey || escalated) return;
    isLoading = true;
    renderChat();
    var body = { sessionKey: sessionKey };
    if (userEmail) body.userEmail = userEmail;
    fetch(API_URL + '/api/public/chat/' + WIDGET_KEY + '/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        isLoading = false;
        if (data.success) {
          escalated = true;
          var msg = 'You’re connected — a member of our team will follow up by email.';
          // The URL renders as a friendly "Track your request" link (see linkify).
          if (data.trackingUrl) msg += '\n' + data.trackingUrl;
          messages.push({ role: 'assistant', content: msg });
        } else {
          messages.push({
            role: 'assistant',
            content: data.error || 'Sorry, I couldn’t connect you right now. Please try again.',
          });
        }
        renderChat();
      })
      .catch(function (err) {
        isLoading = false;
        messages.push({
          role: 'assistant',
          content: 'Sorry, I couldn’t reach the server to connect you. Please try again later.',
        });
        renderChat();
        console.error('[Odly Widget] Escalate error:', err);
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
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  // Escape text, then turn bare http(s) URLs into clickable links. XSS-safe:
  // everything is escaped first and only http/https schemes are wrapped, so no
  // javascript: URLs and no attribute break-out (quotes are escaped in href).
  function linkify(str) {
    var text = String(str == null ? '' : str);
    var urlRe = /(https?:\/\/[^\s<]+[^\s<.,:;!?)\]}'"])/g;
    var out = '';
    var last = 0;
    var m;
    while ((m = urlRe.exec(text)) !== null) {
      out += escapeHtml(text.slice(last, m.index));
      var url = m[0];
      var safe = escapeHtml(url);
      // Customer tracking links (…/track/…) carry an opaque token — show a
      // friendly label instead of the raw URL. Any other link keeps its URL.
      var label = url.indexOf('/track/') !== -1 ? 'Track your request' : safe;
      out += '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      last = m.index + url.length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  // ─── Init ────────────────────────────────────────────────────────────
  fetchConfig();
})();
