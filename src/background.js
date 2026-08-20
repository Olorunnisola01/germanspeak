/**
 * GermanSpeak Background Service Worker (MV3)
 * - Context menu items for translating/speaking the current selection
 * - Keyboard shortcut command
 * - Fallback floating card for pages where the content script can't run
 *   (some PDF viewers, restricted pages)
 */

importScripts('shared/translate-utils.js');

const LANG_BCP47 = {
  de: 'de-DE',
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
};

function toBCP47(lang) {
  const base = (lang || 'en').toLowerCase().slice(0, 2);
  return LANG_BCP47[base] || lang || 'en-US';
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'germanspeak-translate-speak',
    title: '🌐 Translate selection (GermanSpeak)',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'germanspeak-speak-selection',
    title: '🔊 Speak selection (GermanSpeak)',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'germanspeak-separator',
    type: 'separator',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'germanspeak-open-options',
    title: 'Open GermanSpeak Settings',
    contexts: ['action', 'page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'germanspeak-translate-speak' || info.menuItemId === 'germanspeak-speak-selection') {
    const text = (info.selectionText || '').trim();
    if (!text) return;

    const action = info.menuItemId === 'germanspeak-speak-selection' ? 'speak-original' : 'translate';

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'GS_TRIGGER_FROM_CONTEXT',
        text,
        action,
      });
    } catch (_) {
      // Content script not reachable (some PDFs, internal pages, etc.).
      try {
        await showFallbackOnTab(tab.id, text, action);
      } catch (err) {
        console.warn('[GermanSpeak] Fallback failed on tab', tab.id, err);
      }
    }
  }

  if (info.menuItemId === 'germanspeak-open-options') {
    chrome.runtime.openOptionsPage();
  }
});

// Keyboard shortcut: translate + show card for the current selection.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'translate-selection') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'GS_COMMAND_TRANSLATE' });
  } catch (err) {
    console.warn('[GermanSpeak] Could not reach content script for shortcut:', err);
  }
});

async function showFallbackOnTab(tabId, text, action) {
  let settings = { targetLang: 'auto' };
  try {
    settings = { ...settings, ...(await chrome.storage.sync.get(settings)) };
  } catch (_) {}

  let translation = '';
  let detectedLang = 'en';
  let targetLang = 'de';
  try {
    const result = await GSTranslate.translateAuto(text, settings.targetLang);
    translation = result.translated;
    detectedLang = result.detectedLang || 'en';
    targetLang = result.targetLang || 'de';
  } catch (_) {}

  const sourceVoiceLang = toBCP47(detectedLang);
  const targetVoiceLang = toBCP47(targetLang);
  const speakOriginalFirst = action === 'speak-original';

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: (originalText, translatedText, srcLang, tgtLang, speakFirst) => {
      const prev = document.getElementById('germanspeak-fallback-card');
      if (prev) prev.remove();

      const card = document.createElement('div');
      card.id = 'germanspeak-fallback-card';
      card.style.cssText = `
        position: fixed; z-index: 2147483647; bottom: 20px; right: 20px;
        max-width: 360px; background: #fff; color: #111; font: 14px/1.4 system-ui, sans-serif;
        border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.15);
        padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
      `;

      const esc = (s) => (s || '').replace(/</g, '&lt;');

      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; color:#666;">
          <strong style="color:#4f46e5;">GermanSpeak</strong>
          <span style="cursor:pointer; padding:0 6px;" id="gs-fb-close">×</span>
        </div>
        <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:8px; font-size:15px; cursor:pointer;" id="gs-fb-source">
          ${esc(originalText)}
        </div>
        <div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:8px; font-size:15px; cursor:pointer;" id="gs-fb-target">
          ${esc(translatedText) || '(translation unavailable)'}
        </div>
        <div style="display:flex; gap:8px; margin-top:4px;">
          <button id="gs-fb-play-source" style="flex:1; padding:8px 12px; border-radius:8px; border:none; background:#4f46e5; color:white; font-weight:600; cursor:pointer;">🔊 Play original</button>
          <button id="gs-fb-play-target" style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid #e5e7eb; background:white; font-weight:600; cursor:pointer;">🔊 Play translation</button>
        </div>
        <div style="font-size:10px; color:#888; text-align:right;">Click text to replay</div>
      `;

      document.documentElement.appendChild(card);

      try { speechSynthesis.getVoices(); } catch (_) {}

      card.querySelector('#gs-fb-close').onclick = () => card.remove();

      const sourceBox = card.querySelector('#gs-fb-source');
      const targetBox = card.querySelector('#gs-fb-target');
      const playSource = card.querySelector('#gs-fb-play-source');
      const playTarget = card.querySelector('#gs-fb-play-target');

      async function speak(txt, lang, activeBtn) {
        if (!txt) return;
        try {
          speechSynthesis.cancel();

          await new Promise((resolve) => {
            let vs = [];
            try { vs = speechSynthesis.getVoices(); } catch (_) {}
            if (vs && vs.length > 0) return resolve();
            const handler = () => {
              speechSynthesis.removeEventListener('voiceschanged', handler);
              resolve();
            };
            speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
            setTimeout(resolve, 900);
          });

          const u = new SpeechSynthesisUtterance(txt);
          u.lang = lang;
          u.rate = lang.startsWith('de') ? 0.96 : 1.0;
          u.pitch = 1.0;

          const voices = [];
          try { voices.push(...(speechSynthesis.getVoices() || [])); } catch (_) {}

          let best = voices.find(v => /online.*natural|natural.*online|neural/i.test((v.name || '') + (v.voiceURI || '')));
          if (!best) {
            const prefix = lang.slice(0, 2).toLowerCase();
            best = voices.find(v => (v.lang || '').toLowerCase().startsWith(prefix));
          }
          if (!best) best = voices[0];
          if (best) u.voice = best;

          const originalBtnText = activeBtn ? activeBtn.textContent : '';
          if (activeBtn) {
            activeBtn.textContent = '⏹ Playing...';
            activeBtn.disabled = true;
          }

          const cleanup = () => {
            if (activeBtn) {
              activeBtn.textContent = originalBtnText;
              activeBtn.disabled = false;
            }
          };
          u.onend = cleanup;
          u.onerror = cleanup;

          speechSynthesis.speak(u);
        } catch (e) {
          console.warn('[GermanSpeak] Fallback speak error:', e);
        }
      }

      sourceBox.onclick = () => speak(originalText, srcLang, playSource);
      targetBox.onclick = () => { if (translatedText) speak(translatedText, tgtLang, playTarget); };
      playSource.onclick = (e) => { e.stopPropagation(); speak(originalText, srcLang, playSource); };
      playTarget.onclick = (e) => { e.stopPropagation(); if (translatedText) speak(translatedText, tgtLang, playTarget); };

      if (speakFirst) {
        setTimeout(() => speak(originalText, srcLang, playSource), 180);
      }

      setTimeout(() => {
        if (card && card.parentNode && !card.matches(':hover')) {
          card.style.transition = 'opacity .2s';
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 200);
        }
      }, 14000);
    },
    args: [text, translation, sourceVoiceLang, targetVoiceLang, speakOriginalFirst],
  });
}

// Settings get/set used by popup & options pages.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GS_GET_SETTINGS') {
    chrome.storage.sync.get(null, (settings) => sendResponse(settings || {}));
    return true;
  }

  if (message?.type === 'GS_SAVE_SETTINGS') {
    chrome.storage.sync.set(message.payload || {}, () => sendResponse({ ok: true }));
    return true;
  }
});
