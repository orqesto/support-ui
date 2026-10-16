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
  // Contact details (name/email) are collected by the AI conversationally — in the
  // visitor's own language — NOT via hardcoded widget prompts. The server persists
  // them and reports `hasEmail` back so we know whether the Connect button can
  // escalate directly.
  var sessionStarted = false; // set once we've reset any stale session on open
  var hasEmail = false;
  // `escalated` hides the "Connect with our team" button once the session has been
  // handed to a human (via the button OR the bot's own escalate tool).
  var escalated = false;
  // Email confirmation (one-time code). The email is unverified until the visitor types the code
  // we sent there; only then do their email replies join this chat for the team. Offered at
  // "Connect with our team" and after any handoff, never required.
  var emailVerified = false;
  var verifyState = null; // null | 'offer' | 'code'
  var verifyThenEscalate = false;
  var verifyDismissed = false;
  var verifyBusy = false;
  var verifyMasked = '';
  var verifyError = '';
  // After a handoff the team answers by email; their replies (and the visitor's own email
  // replies) are fetched from the server and shown here. `handoff` is persisted per widget as
  // { sessionKey, cursor } so a reload keeps the session and the replies come back.
  var HANDOFF_KEY = 'odly_handoff_' + WIDGET_KEY;
  var POLL_MS = 20000;
  var POLL_MAX_MS = 300000;
  var pollTimer = null;
  var pollInFlight = false;
  var pollDelay = POLL_MS;
  var pollDisabled = false; // set by a 404 (session gone, or a backend without the route) until next open
  var replyCursor = 0; // last event id rendered in THIS page load (messages are not persisted)
  var seenReplyIds = {};
  var quietRender = false; // a render caused by polling must not move focus

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
    '#odly-widget-root .odly-msg-label{font-size:11px;font-weight:600;opacity:.7;margin-bottom:2px}',

    /* Quick-action buttons (Skip / Connect with our team) */
    '#odly-widget-root .odly-actions{display:flex;flex-wrap:wrap;gap:8px;align-self:flex-start;margin-top:-2px}',
    '#odly-widget-root .odly-verify{align-self:stretch;display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;font-size:13px;color:#374151}',
    '#odly-widget-root .odly-verify-input{font:inherit;font-size:16px;letter-spacing:4px;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;width:100%;box-sizing:border-box}',
    '#odly-widget-root .odly-verify-error{color:#b91c1c;font-size:12px}',
    '#odly-widget-root .odly-action-btn{cursor:pointer;touch-action:manipulation;border:1px solid var(--odly-primary,#0070F3);background:#fff;color:var(--odly-primary,#0070F3);border-radius:20px;padding:9px 16px;font-size:13px;font-weight:500;line-height:1;transition:background .15s,color .15s}',
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
       detaches it from the toggle's offset entirely.
       - height:100dvh tracks the *visible* viewport (dynamic units), so the input
         row isn't hidden behind the browser chrome. When the on-screen keyboard
         opens, syncViewport() further pins height/top to window.visualViewport so
         the input stays above the keyboard (dvh alone doesn't react to keyboards).
       - Hide the floating toggle while the panel is open: fullscreen, it would
         otherwise float over the input/send at the bottom-right and swallow taps
         (the header × already closes the chat). */
    '@media(max-width:440px){#odly-chat{position:fixed;top:0;left:0;right:0;bottom:0;width:auto;max-width:none;height:100dvh;max-height:none;border-radius:0}#odly-widget-root.odly-left #odly-chat{left:0;right:0}#odly-chat.odly-open ~ #odly-toggle{display:none}}'
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

    // On first open, reset any stale session so the AI collects contact info fresh.
    resetSessionIfCollecting();

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
      // Fetched replies: 'agent' sits on the assistant side, 'visitor' (their email
      // replies) on the visitor's side. Content is plain text and goes through linkify,
      // which escapes everything.
      var side = msg.role === 'agent' ? 'assistant' : msg.role === 'visitor' ? 'user' : msg.role;
      el.className = 'odly-msg odly-msg-' + side;
      var html = linkify(msg.content);
      if (msg.role === 'agent') {
        var who = (widgetConfig && widgetConfig.agentLabel) || 'Support team';
        html = '<div class="odly-msg-label">' + escapeHtml(who) + '</div>' + html;
      }
      el.innerHTML = html;
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

    renderVerification(area);

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

      // Focus input when chat opens (not when a fetched reply re-renders the panel).
      if (!quietRender) input.focus();
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

  // On a fresh open, if this widget collects contact info, start a brand-new
  // session so the AI gathers name/email for THIS conversation (any persisted
  // session belongs to a previous chat). No hardcoded prompts — the AI asks, in
  // the visitor's own language, on its first reply. The welcome bubble is shown
  // by renderMessages while the message list is empty.
  function resetSessionIfCollecting() {
    if (sessionStarted || !widgetConfig) return; // wait until config is loaded
    sessionStarted = true;
    // A handed-off session is kept: the team's replies arrive in it.
    if (escalated) return;
    if (widgetConfig.collectUserInfo && messages.length === 0 && sessionKey) {
      sessionKey = '';
      hasEmail = false;
      emailVerified = false;
      verifyState = null;
      verifyDismissed = false;
      try {
        localStorage.removeItem('odly_session_' + WIDGET_KEY);
      } catch (e) {
        /* localStorage unavailable — non-fatal */
      }
    }
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

    // Build request body. Name/email are collected + persisted server-side by the
    // AI (capture_contact), so the widget no longer sends them.
    var body = { message: text };
    if (sessionKey) body.sessionKey = sessionKey;

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
          // The server reports contact + handoff state back to us.
          if (typeof data.hasEmail === 'boolean') hasEmail = data.hasEmail;
          if (typeof data.emailVerified === 'boolean') emailVerified = data.emailVerified;
          // The bot may hand off to a human on its own (escalate_to_human tool);
          // hide the Connect button when it does, and offer the email confirmation.
          if (data.sessionKey) {
            if (data.sessionKey !== sessionKey) clearHandoff();
            sessionKey = data.sessionKey;
            localStorage.setItem('odly_session_' + WIDGET_KEY, sessionKey);
          }
          if (data.escalated) {
            markEscalated();
            offerVerificationAfterHandoff();
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

  // ─── Email confirmation ──────────────────────────────────────────────
  var VERIFY_DEFAULTS = {
    promptText: 'Confirm your email so our replies by email stay in this chat.',
    sendLabel: 'Send code',
    codePlaceholder: '6-digit code',
    verifyLabel: 'Confirm',
    skipLabel: 'Skip',
    sentText: 'We sent a code to {email}.',
    successText: 'Thanks, your email is confirmed.',
    errorText: 'That did not work. Please check the code and try again.',
    sendErrorText: 'We could not send a code right now. You can skip and continue.',
  };

  function verifyText(key) {
    var ev = widgetConfig && widgetConfig.emailVerification;
    return (ev && ev.texts && ev.texts[key]) || VERIFY_DEFAULTS[key];
  }

  function verificationAvailable() {
    var ev = widgetConfig && widgetConfig.emailVerification;
    return !!(ev && ev.available) && hasEmail && !emailVerified;
  }

  // Called after any handoff: offer the confirmation once, unless already declined.
  function offerVerificationAfterHandoff() {
    if (verificationAvailable() && !verifyDismissed && !verifyState) {
      verifyState = 'offer';
      verifyThenEscalate = false;
    }
  }

  function finishVerification() {
    var thenEscalate = verifyThenEscalate;
    verifyState = null;
    verifyThenEscalate = false;
    verifyError = '';
    verifyDismissed = true;
    if (thenEscalate && !escalated) doEscalate();
    else renderChat();
  }

  function postVerification(path, body, onDone) {
    verifyBusy = true;
    verifyError = '';
    renderChat();
    fetch(API_URL + '/api/public/chat/' + WIDGET_KEY + '/email-verification/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) { verifyBusy = false; onDone(data || {}); })
      .catch(function () { verifyBusy = false; onDone({}); });
  }

  function sendVerificationCode() {
    postVerification('send', { sessionKey: sessionKey }, function (data) {
      if (data.status === 'sent') {
        verifyState = 'code';
        verifyMasked = data.maskedEmail || '';
        renderChat();
      } else if (data.status === 'already_verified') {
        emailVerified = true;
        finishVerification();
      } else if (data.status === 'no_email' || data.status === 'unavailable') {
        finishVerification();
      } else {
        // too_soon / limit_reached / send_failed: no code went out; Skip still continues.
        verifyError = verifyText('sendErrorText');
        renderChat();
      }
    });
  }

  function confirmVerificationCode(code) {
    postVerification('confirm', { sessionKey: sessionKey, code: code }, function (data) {
      if (data.status === 'verified') {
        emailVerified = true;
        messages.push({ role: 'assistant', content: verifyText('successText') });
        finishVerification();
      } else {
        verifyError = verifyText('errorText');
        renderChat();
      }
    });
  }

  // The panel under the messages. All text goes through textContent / attributes set via
  // the DOM: the admin's texts and the masked address are never written as HTML.
  function renderVerification(area) {
    if (!verifyState) return;
    var box = document.createElement('div');
    box.className = 'odly-verify';
    var p = document.createElement('div');
    p.className = 'odly-verify-text';
    p.textContent =
      verifyState === 'code'
        ? verifyText('sentText').replace('{email}', verifyMasked || 'your email')
        : verifyText('promptText');
    box.appendChild(p);

    var row = document.createElement('div');
    row.className = 'odly-actions';
    var input = null;
    if (verifyState === 'code') {
      input = document.createElement('input');
      input.className = 'odly-verify-input';
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('autocomplete', 'one-time-code');
      input.setAttribute('maxlength', '6');
      input.placeholder = verifyText('codePlaceholder');
      box.appendChild(input);
    }
    var primary = document.createElement('button');
    primary.className = 'odly-action-btn';
    primary.textContent = verifyState === 'code' ? verifyText('verifyLabel') : verifyText('sendLabel');
    primary.disabled = verifyBusy;
    primary.onclick = function () {
      if (verifyBusy) return;
      if (verifyState === 'code') {
        var code = (input && input.value || '').replace(/\D/g, '');
        if (code.length !== 6) {
          verifyError = verifyText('errorText');
          renderChat();
          return;
        }
        confirmVerificationCode(code);
      } else {
        sendVerificationCode();
      }
    };
    var skip = document.createElement('button');
    skip.className = 'odly-action-btn';
    skip.textContent = verifyText('skipLabel');
    skip.disabled = verifyBusy;
    skip.onclick = function () { if (!verifyBusy) finishVerification(); };
    row.appendChild(primary);
    row.appendChild(skip);
    box.appendChild(row);
    if (verifyError) {
      var err = document.createElement('div');
      err.className = 'odly-verify-error';
      err.textContent = verifyError;
      box.appendChild(err);
    }
    area.appendChild(box);
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); primary.onclick(); }
      });
      if (!quietRender) setTimeout(function () { input.focus(); }, 0);
    }
  }

  // ─── Human handoff ───────────────────────────────────────────────────
  // The only quick action is "Connect with our team" (org-agnostic label;
  // overridable via widgetConfig.humanHandoffLabel). It needs a live session
  // (created on the first message) and hides once handed off.
  function currentActions() {
    if (isLoading || escalated || !sessionKey || verifyState) return [];
    var label = (widgetConfig && widgetConfig.humanHandoffLabel) || 'Connect with our team';
    return [{ id: 'connect', label: label }];
  }

  function handleAction(id) {
    if (id === 'connect') requestConnect();
  }

  // Hybrid handoff. If the server has already captured an email, escalate
  // directly (deterministic, instant). Otherwise let the AI run the handoff so
  // it asks for the email in the visitor's language, then escalates.
  function requestConnect() {
    if (!sessionKey || escalated || isLoading) return;
    if (hasEmail && verificationAvailable()) {
      // Offer the code first; Skip (or a failure) still hands off.
      verifyState = 'offer';
      verifyThenEscalate = true;
      renderChat();
    } else if (hasEmail) doEscalate();
    else sendConnectRequest();
  }

  // No email yet → ask the AI to handle the connect request (in-language). Sends
  // an intent flag with no user message; the reply typically asks for the email.
  function sendConnectRequest() {
    isLoading = true;
    renderChat();
    fetch(API_URL + '/api/public/chat/' + WIDGET_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionKey: sessionKey, wantsHuman: true }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        isLoading = false;
        if (data.success) {
          messages.push({ role: 'assistant', content: data.reply });
          if (typeof data.hasEmail === 'boolean') hasEmail = data.hasEmail;
          if (typeof data.emailVerified === 'boolean') emailVerified = data.emailVerified;
          if (data.escalated) {
            markEscalated();
            offerVerificationAfterHandoff();
          }
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
        console.error('[Odly Widget] Connect error:', err);
      });
  }

  // Deterministic handoff via the public escalate endpoint (email already on
  // file). Idempotent server-side.
  function doEscalate() {
    if (!sessionKey || escalated) return;
    isLoading = true;
    renderChat();
    fetch(API_URL + '/api/public/chat/' + WIDGET_KEY + '/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionKey: sessionKey }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        isLoading = false;
        if (data.success) {
          markEscalated();
          var msg = HANDOFF_NOTE;
          // The URL renders as a friendly "Track your request" link (see linkify).
          if (data.trackingUrl) msg += '\n' + data.trackingUrl;
          messages.push({ role: 'assistant', content: msg });
          if (typeof data.hasEmail === 'boolean') hasEmail = data.hasEmail;
          if (typeof data.emailVerified === 'boolean') emailVerified = data.emailVerified;
          offerVerificationAfterHandoff();
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

  // ─── Replies after handoff ──────────────────────────────────────────
  var HANDOFF_NOTE = 'You’re connected — a member of our team will follow up by email.';

  function readHandoff() {
    try {
      var raw = localStorage.getItem(HANDOFF_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function persistHandoff() {
    try {
      localStorage.setItem(HANDOFF_KEY, JSON.stringify({ sessionKey: sessionKey, cursor: replyCursor }));
    } catch (e) {
      /* localStorage unavailable — non-fatal */
    }
  }

  function clearHandoff() {
    escalated = false;
    replyCursor = 0;
    seenReplyIds = {};
    stopPolling();
    try {
      localStorage.removeItem(HANDOFF_KEY);
    } catch (e) {
      /* localStorage unavailable — non-fatal */
    }
  }

  // Escalation in this page load (the Connect button OR the bot's own handoff).
  function markEscalated() {
    if (!escalated) {
      escalated = true;
      persistHandoff();
    }
    // Nothing has been answered yet: the first fetch waits one interval.
    schedulePoll(POLL_MS);
  }

  function pollingWanted() {
    return isOpen && escalated && !!sessionKey && !pollDisabled && document.visibilityState !== 'hidden';
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function schedulePoll(delay) {
    stopPolling();
    if (pollingWanted() && !pollInFlight) pollTimer = setTimeout(fetchReplies, delay);
  }

  // Re-render for fetched replies without losing what the visitor is typing or moving focus.
  function renderKeepingDraft() {
    var input = document.getElementById('odly-input');
    var code = chat.querySelector('.odly-verify-input');
    var draft = input ? input.value : '';
    var codeDraft = code ? code.value : '';
    var hadFocus = !!(input && document.activeElement === input);
    quietRender = true;
    try {
      renderChat();
    } finally {
      quietRender = false;
    }
    var nextInput = document.getElementById('odly-input');
    var nextCode = chat.querySelector('.odly-verify-input');
    if (nextInput) {
      nextInput.value = draft;
      if (hadFocus) nextInput.focus();
    }
    if (nextCode) nextCode.value = codeDraft;
  }

  // One request at a time. Any failure is silent for the visitor: a 404 (session gone,
  // or a backend that does not have this route yet) stops polling until the next open;
  // anything else backs off.
  function fetchReplies() {
    pollTimer = null;
    if (pollInFlight || !pollingWanted()) return;
    pollInFlight = true;
    var askedFor = sessionKey;
    fetch(API_URL + '/api/public/chat/' + WIDGET_KEY + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionKey: sessionKey, after: replyCursor }),
    })
      .then(function (r) {
        if (!r.ok) {
          var failure = new Error('HTTP ' + r.status);
          failure.status = r.status;
          throw failure;
        }
        return r.json();
      })
      .then(function (data) {
        pollInFlight = false;
        if (askedFor !== sessionKey || !escalated) return; // session changed meanwhile
        if (!data || !data.success) throw new Error('unsuccessful');
        pollDelay = POLL_MS;
        if (applyReplies(data) && isOpen) renderKeepingDraft();
        schedulePoll(pollDelay);
      })
      .catch(function (err) {
        pollInFlight = false;
        if (err && err.status === 404) {
          pollDisabled = true;
          return;
        }
        pollDelay = Math.min(pollDelay * 2, POLL_MAX_MS);
        schedulePoll(pollDelay);
      });
  }

  // Adds unseen replies in id order and advances the cursor. Returns true when any were added.
  function applyReplies(data) {
    var list = Array.isArray(data.messages) ? data.messages.slice() : [];
    list.sort(function (left, right) { return Number(left.id) - Number(right.id); });
    var added = false;
    var highest = replyCursor;
    list.forEach(function (item) {
      if (!item || typeof item.id !== 'number' || typeof item.content !== 'string') return;
      if (item.role !== 'agent' && item.role !== 'visitor') return;
      if (item.id > highest) highest = item.id;
      if (seenReplyIds[item.id]) return;
      seenReplyIds[item.id] = true;
      messages.push({ role: item.role, content: item.content, id: item.id });
      added = true;
    });
    if (typeof data.cursor === 'number' && data.cursor > highest) highest = data.cursor;
    if (highest !== replyCursor) {
      replyCursor = highest;
      persistHandoff();
    }
    return added;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') stopPolling();
    else if (pollingWanted() && !pollTimer && !pollInFlight) fetchReplies();
  });

  // ─── Toggle ──────────────────────────────────────────────────────────
  // Keep the fullscreen mobile panel sized to the *visible* viewport. When the
  // on-screen keyboard opens, the layout viewport doesn't shrink, so a plain
  // position:fixed;bottom:0 input row slides behind the keyboard ("weird, but not
  // always" — only when typing). visualViewport reports the real visible area, so
  // we pin the panel to it. Desktop / wide viewports keep the CSS-driven sizing.
  function syncViewport() {
    var vv = window.visualViewport;
    if (!vv || !isOpen || window.innerWidth > 440) {
      chat.style.top = '';
      chat.style.bottom = '';
      chat.style.height = '';
      return;
    }
    chat.style.top = vv.offsetTop + 'px';
    chat.style.bottom = 'auto';
    chat.style.height = vv.height + 'px';
  }

  function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
      chat.classList.add('odly-open');
      toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      renderChat();
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncViewport);
        window.visualViewport.addEventListener('scroll', syncViewport);
        syncViewport();
      }
      // Replies after a handoff: fetch now, then every POLL_MS while open and visible.
      pollDisabled = false;
      pollDelay = POLL_MS;
      if (pollingWanted() && !pollInFlight) fetchReplies();
    } else {
      stopPolling();
      chat.classList.remove('odly-open');
      toggle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>';
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', syncViewport);
        window.visualViewport.removeEventListener('scroll', syncViewport);
      }
      // Drop the inline viewport overrides so the toggle/panel reset cleanly.
      chat.style.top = '';
      chat.style.bottom = '';
      chat.style.height = '';
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
  // A handed-off session survives a reload. The bot transcript is not stored, so the
  // handoff note stands in for it, and the first open fetches every reply again
  // (after=0 — `replyCursor` deliberately starts at 0 in each page load).
  var storedHandoff = readHandoff();
  if (storedHandoff && sessionKey && storedHandoff.sessionKey === sessionKey) {
    escalated = true;
    messages.push({ role: 'assistant', content: HANDOFF_NOTE });
  } else if (storedHandoff) {
    clearHandoff();
  }

  fetchConfig();
})();
