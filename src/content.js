/**
 * GermanSpeak Content Script
 *
 * Flow:
 *  - User selects text on the page.
 *  - A small floating icon appears near the selection (if enabled in settings).
 *  - Clicking the icon opens a single card showing the original text and its
 *    translation (auto-detected direction: German -> English, or anything
 *    else -> German), each with a Play button for high quality speech.
 *  - Right-click context menu and a keyboard shortcut provide the same
 *    features without needing the icon.
 */

(() => {
  if (window.__germanspeakInjected) return;
  window.__germanspeakInjected = true;

  const protocol = location.protocol;
  if (protocol === 'chrome:' || protocol === 'edge:' || protocol === 'about:' ||
      protocol === 'chrome-extension:' || protocol === 'moz-extension:') {
    return;
  }

  const isPdfContext = (document.contentType && document.contentType.indexOf('pdf') !== -1) ||
                       location.pathname.toLowerCase().endsWith('.pdf') ||
                       /\.(pdf)(\?|#|$)/i.test(location.href);

  const { GSVoice, GSTranslate } = window;

  // ============ SETTINGS ============
  const DEFAULT_SETTINGS = {
    autoShowIcon: true,
    speechRate: 1.0,
    targetLang: 'auto', // 'auto' | 'de' | 'en'
  };
  let settings = { ...DEFAULT_SETTINGS };

  function loadSettings() {
    try {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
        settings = { ...DEFAULT_SETTINGS, ...stored };
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (const key of Object.keys(changes)) {
          if (key in DEFAULT_SETTINGS) settings[key] = changes[key].newValue;
        }
      });
    } catch (_) {
      // chrome.storage unavailable (shouldn't happen with our permissions)
    }
  }

  // ============ STATE ============
  let shadowHost = null;
  let shadowRoot = null;
  let iconEl = null;
  let cardEl = null;
  let cardOpen = false;

  let currentSelectionText = '';
  let currentRange = null;
  let lastSelectionText = '';

  let isSpeaking = false;
  let currentUtterance = null;

  let lastMouseX = 0;
  let lastMouseY = 0;
  document.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }, { passive: true });

  // ============ TEXT-TO-SPEECH ============
  async function speak(text, lang, buttonEl) {
    if (!text || !text.trim()) return;

    stopSpeaking();

    try {
      const voices = await GSVoice.waitForVoices();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const base = settings.speechRate || 1.0;
      utterance.rate = lang.startsWith('de') ? base * 0.96 : base;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const bestVoice = GSVoice.getBestVoice(voices, lang);
      if (bestVoice) utterance.voice = bestVoice;

      currentUtterance = utterance;
      isSpeaking = true;

      if (buttonEl) buttonEl.classList.add('gs-playing');

      const cleanup = () => {
        isSpeaking = false;
        currentUtterance = null;
        if (buttonEl) buttonEl.classList.remove('gs-playing');
      };

      utterance.onend = cleanup;
      utterance.onerror = (e) => {
        console.warn('[GermanSpeak] Speech error:', e);
        cleanup();
      };

      speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('[GermanSpeak] Speak failed:', err);
      isSpeaking = false;
      currentUtterance = null;
    }
  }

  function stopSpeaking() {
    try { speechSynthesis.cancel(); } catch (_) {}
    isSpeaking = false;
    currentUtterance = null;

    if (shadowRoot) {
      shadowRoot.querySelectorAll('.gs-playing').forEach((el) => el.classList.remove('gs-playing'));
    }
  }

  // ============ SHADOW HOST ============
  function ensureShadowHost() {
    if (shadowHost) return;

    shadowHost = document.createElement('div');
    shadowHost.id = 'germanspeak-shadow-host';
    shadowHost.style.all = 'initial';
    shadowHost.style.position = 'fixed';
    shadowHost.style.zIndex = '2147483647';
    shadowHost.style.left = '0';
    shadowHost.style.top = '0';
    shadowHost.style.width = '0';
    shadowHost.style.height = '0';
    document.documentElement.appendChild(shadowHost);

    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/content.css');
    shadowRoot.appendChild(link);
  }

  // ============ ICON ============
  function removeIcon() {
    if (iconEl && iconEl.parentNode) iconEl.parentNode.removeChild(iconEl);
    iconEl = null;
  }

  function positionElementNearRange(el, range, width, height) {
    if (range) {
      try {
        const rects = range.getClientRects();
        const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();

        let left = rect.right + window.scrollX + 6;
        let top = rect.top + window.scrollY + (rect.height / 2) - (height / 2);

        if (left + width > window.scrollX + window.innerWidth - 8) {
          left = rect.left + window.scrollX + rect.width / 2 - width / 2;
          top = rect.top + window.scrollY - height - 8;
          if (top < window.scrollY + 4) {
            top = rect.bottom + window.scrollY + 8;
          }
        }

        left = Math.max(window.scrollX + 4, Math.min(left, window.scrollX + window.innerWidth - width - 4));
        top = Math.max(window.scrollY + 4, top);

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        return;
      } catch (_) {}
    }

    // Fallback: last known mouse position (PDF viewers etc.)
    const x = lastMouseX || Math.round(window.innerWidth / 2);
    const y = lastMouseY || 140;
    el.style.left = `${Math.max(4, x + window.scrollX + 8)}px`;
    el.style.top = `${Math.max(4, y + window.scrollY - height / 2)}px`;
  }

  function showIcon(range, text) {
    ensureShadowHost();
    removeIcon();

    const btn = document.createElement('div');
    btn.className = 'gs-icon';
    btn.title = 'GermanSpeak: Translate & speak this text';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M3 10v4c0 1.1.9 2 2 2h2l3.5 3.5c.8.8 2.1.2 2.1-.9V6c0-1.1-1.3-1.7-2.1-.9L7 8.5H5c-1.1 0-2 .9-2 2zm13.5 1.5L21 8v8l-4.5-3.5zM19 4l-1.4 1.4C19.8 6.7 21 9.2 21 12s-1.2 5.3-3.4 6.6L19 20c2.8-1.7 4.5-4.7 4.5-8s-1.7-6.3-4.5-8z"/>
      </svg>
    `;

    positionElementNearRange(btn, range, 32, 32);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cardOpen) {
        closeCard();
      } else {
        openCard(text, range, btn);
      }
    });

    document.documentElement.appendChild(btn);
    iconEl = btn;
  }

  // ============ CARD ============
  function closeCard() {
    if (cardEl) cardEl.style.display = 'none';
    cardOpen = false;
    stopSpeaking();
  }

  function buildCard() {
    if (cardEl) return cardEl;

    ensureShadowHost();

    cardEl = document.createElement('div');
    cardEl.className = 'gs-card';
    cardEl.style.display = 'none';

    cardEl.innerHTML = `
      <div class="gs-card-header">
        <div class="gs-card-logo">GermanSpeak</div>
        <div class="gs-card-close" title="Close (Esc)">×</div>
      </div>
      <div class="gs-card-body">
        <div class="gs-row gs-source-row">
          <div class="gs-row-top">
            <span class="gs-flag gs-source-flag"></span>
            <span class="gs-lang-label gs-source-label"></span>
            <button class="gs-icon-btn gs-source-play" title="Play">🔊</button>
          </div>
          <div class="gs-text gs-source-text playable" title="Click to play"></div>
        </div>
        <div class="gs-row gs-target-row">
          <div class="gs-row-top">
            <span class="gs-flag gs-target-flag"></span>
            <span class="gs-lang-label gs-target-label"></span>
            <button class="gs-icon-btn gs-target-play" title="Play">🔊</button>
            <button class="gs-icon-btn gs-copy" title="Copy translation">📋</button>
          </div>
          <div class="gs-text gs-target-text playable" title="Click to play"></div>
        </div>
      </div>
      <div class="gs-card-footer">
        <button class="gs-btn gs-stop" type="button">⏹ Stop</button>
        <span class="gs-credit">Google Translate &amp; Web Speech</span>
      </div>
    `;

    shadowRoot.appendChild(cardEl);
    wireCardEvents(cardEl);
    return cardEl;
  }

  function wireCardEvents(card) {
    card.querySelector('.gs-card-close').addEventListener('click', () => {
      closeCard();
    });

    card.querySelector('.gs-stop').addEventListener('click', () => {
      stopSpeaking();
    });

    card.querySelector('.gs-source-play').addEventListener('click', (e) => {
      const lang = card.dataset.sourceLang || 'en-US';
      speak(currentCardData.original, lang, e.currentTarget);
    });

    card.querySelector('.gs-source-text').addEventListener('click', () => {
      const lang = card.dataset.sourceLang || 'en-US';
      speak(currentCardData.original, lang, card.querySelector('.gs-source-play'));
    });

    card.querySelector('.gs-target-play').addEventListener('click', (e) => {
      const lang = card.dataset.targetLang || 'en-US';
      speak(currentCardData.translation, lang, e.currentTarget);
    });

    card.querySelector('.gs-target-text').addEventListener('click', () => {
      const lang = card.dataset.targetLang || 'en-US';
      speak(currentCardData.translation, lang, card.querySelector('.gs-target-play'));
    });

    card.querySelector('.gs-copy').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const text = currentCardData.translation;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const original = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { if (btn.isConnected) btn.textContent = original; }, 1200);
    });
  }

  let currentCardData = { original: '', translation: '' };

  function setCardLoading(card, original) {
    currentCardData = { original, translation: '' };

    card.querySelector('.gs-source-text').textContent = original;
    card.querySelector('.gs-source-flag').textContent = '🌐';
    card.querySelector('.gs-source-label').textContent = '';

    const targetText = card.querySelector('.gs-target-text');
    targetText.innerHTML = `<span class="gs-loading"><span class="gs-spinner"></span><span>Translating...</span></span>`;
    card.querySelector('.gs-target-flag').textContent = '';
    card.querySelector('.gs-target-label').textContent = '';
  }

  function setCardResult(card, original, translation, detectedLang, targetLang) {
    currentCardData = { original, translation };

    const sourceLang = GSVoice.langToBCP47(detectedLang);
    const fullTargetLang = GSVoice.langToBCP47(targetLang);

    card.dataset.sourceLang = sourceLang;
    card.dataset.targetLang = fullTargetLang;

    card.querySelector('.gs-source-flag').textContent = GSVoice.flagFor(detectedLang);
    card.querySelector('.gs-source-label').textContent = (detectedLang || '').toUpperCase();
    card.querySelector('.gs-source-text').textContent = original;

    card.querySelector('.gs-target-flag').textContent = GSVoice.flagFor(targetLang);
    card.querySelector('.gs-target-label').textContent = (targetLang || '').toUpperCase();
    card.querySelector('.gs-target-text').textContent = translation || '(no translation available)';
  }

  function setCardError(card, original, message) {
    currentCardData = { original, translation: '' };
    card.dataset.sourceLang = 'en-US';

    card.querySelector('.gs-target-flag').textContent = '';
    card.querySelector('.gs-target-label').textContent = '';
    card.querySelector('.gs-target-text').innerHTML = `<span class="gs-error">${message}</span>`;
  }

  function positionCard(card, anchorEl, range, fixedPos) {
    const width = Math.min(360, window.innerWidth * 0.92);
    card.style.width = `${width}px`;
    card.style.display = 'block';

    if (fixedPos) {
      const left = Math.max(window.scrollX + 8, Math.min(fixedPos.left, window.scrollX + window.innerWidth - width - 8));
      card.style.left = `${left}px`;
      card.style.top = `${fixedPos.top}px`;
      return;
    }

    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      let left = rect.left + window.scrollX;
      let top = rect.bottom + window.scrollY + 8;

      const cardHeight = card.offsetHeight || 220;
      if (window.innerHeight - rect.bottom < cardHeight + 16 && rect.top > cardHeight + 16) {
        top = rect.top + window.scrollY - cardHeight - 8;
      }

      left = Math.max(window.scrollX + 8, Math.min(left, window.scrollX + window.innerWidth - width - 8));

      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      return;
    }

    positionElementNearRange(card, range, width, card.offsetHeight || 220);
  }

  async function openCard(text, range, anchorEl, fixedPos) {
    const card = buildCard();
    setCardLoading(card, text);
    positionCard(card, anchorEl, range, fixedPos);
    cardOpen = true;

    try {
      const result = await GSTranslate.translateAuto(text, settings.targetLang);
      // The selection may have changed while we were waiting.
      if (currentCardData.original !== text) return;
      setCardResult(card, text, result.translated, result.detectedLang, result.targetLang);
      positionCard(card, anchorEl, range, fixedPos);
    } catch (err) {
      console.warn('[GermanSpeak] Translation failed:', err);
      if (currentCardData.original === text) {
        setCardError(card, text, 'Could not translate. Check your internet connection.');
      }
    }
  }

  // ============ SELECTION HANDLING ============
  function getSelectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;

    const text = sel.toString().trim();
    if (!text) return null;

    let range = null;
    try { range = sel.getRangeAt(0); } catch (_) {}

    return { text: text.slice(0, 2000), range };
  }

  let checkTimer = null;
  function scheduleCheck(delay) {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(checkSelection, delay);
  }

  function checkSelection() {
    if (cardOpen) return;

    const info = getSelectionInfo();
    if (!info) {
      if (lastSelectionText) {
        lastSelectionText = '';
        removeIcon();
      }
      return;
    }

    if (info.text === lastSelectionText) return;
    lastSelectionText = info.text;
    currentSelectionText = info.text;
    currentRange = info.range;

    if (settings.autoShowIcon) {
      if (info.range || isPdfContext) {
        showIcon(info.range, info.text);
      }
    } else {
      removeIcon();
    }
  }

  function setupListeners() {
    document.addEventListener('mouseup', () => scheduleCheck(40), true);
    document.addEventListener('pointerup', () => scheduleCheck(50), true);
    document.addEventListener('selectionchange', () => scheduleCheck(120), true);

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift' || e.key.startsWith('Arrow')) {
        scheduleCheck(90);
      }
    }, true);

    // Close the card / icon when clicking outside of them.
    document.addEventListener('mousedown', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      const insideIcon = iconEl && path.includes(iconEl);
      const insideCard = shadowHost && path.includes(shadowHost);

      if (!insideIcon && !insideCard) {
        if (cardOpen) {
          closeCard();
        }
        if (iconEl && window.getSelection().isCollapsed) {
          removeIcon();
          lastSelectionText = '';
        }
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      let handled = false;
      if (cardOpen) { closeCard(); handled = true; }
      if (iconEl) { removeIcon(); lastSelectionText = ''; handled = true; }
      if (handled) e.preventDefault();
    });

    // Reposition / hide on scroll.
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      if (!iconEl && !cardOpen) return;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        removeIcon();
        if (cardOpen) closeCard();
        lastSelectionText = '';
      }, 150);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopSpeaking();
    });
    window.addEventListener('beforeunload', stopSpeaking);

    // PDF viewers often don't fire normal selection events on the outer
    // document. A light poller catches selection changes there.
    if (isPdfContext) {
      setInterval(() => {
        if (cardOpen) return;
        try {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) {
            const txt = (sel.toString() || '').trim();
            if (txt && txt !== lastSelectionText) scheduleCheck(0);
          }
        } catch (_) {}
      }, 700);
    }
  }

  // ============ CONTEXT MENU / COMMANDS (from background.js) ============
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'GS_TRIGGER_FROM_CONTEXT' || msg.type === 'GS_COMMAND_TRANSLATE') {
      let text = (msg.text || currentSelectionText || '').trim();
      if (!text) {
        const info = getSelectionInfo();
        text = info ? info.text : '';
      }
      if (!text) return;

      removeIcon();
      currentSelectionText = text;
      lastSelectionText = text;

      ensureShadowHost();
      const card = buildCard();

      const fixedPos = {
        left: Math.max(8, (window.innerWidth - 360) / 2 + window.scrollX),
        top: Math.max(16, 80 + window.scrollY),
      };

      const speakOriginalWhenReady = msg.action === 'speak-original';

      openCard(text, null, null, fixedPos).then(() => {
        if (speakOriginalWhenReady && currentCardData.original === text) {
          const lang = card.dataset.sourceLang || 'en-US';
          speak(text, lang, card.querySelector('.gs-source-play'));
        }
      });
    }
  });

  // ============ INITIALIZE ============
  function init() {
    loadSettings();
    GSVoice.waitForVoices().catch(() => {});
    setupListeners();
  }

  init();
})();
