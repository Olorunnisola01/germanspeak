/**
 * GermanSpeak Popup Script
 * Settings + quick test area.
 */

const { GSVoice, GSTranslate } = window;

const DEFAULT_SETTINGS = {
  autoShowIcon: true,
  speechRate: 1.0,
  targetLang: 'auto',
};

let currentUtterance = null;
let lastResult = { original: '', translation: '', sourceLang: 'en-US', targetLang: 'de-DE' };

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

function saveSettings(partial) {
  chrome.storage.sync.set(partial);
}

function applySettingsToUI(settings) {
  document.getElementById('auto-show-icon').checked = settings.autoShowIcon;
  document.getElementById('target-lang').value = settings.targetLang;
  document.getElementById('speech-rate').value = settings.speechRate;
  document.getElementById('rate-value').textContent = `${Number(settings.speechRate).toFixed(2)}x`;
  updateDirectionHint(settings.targetLang);
}

function updateDirectionHint(targetLang) {
  const hint = document.getElementById('direction-hint');
  if (targetLang === 'de') hint.textContent = 'Always translate to German';
  else if (targetLang === 'en') hint.textContent = 'Always translate to English';
  else hint.textContent = 'Auto-detect (German ↔ English, etc.)';
}

async function speak(text, lang, statusEl, activeBtn) {
  if (!text || !text.trim()) return;

  speechSynthesis.cancel();
  currentUtterance = null;

  const settings = await loadSettings();
  const voices = await GSVoice.waitForVoices();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const base = settings.speechRate || 1.0;
  u.rate = lang.startsWith('de') ? base * 0.96 : base;
  u.pitch = 1.0;

  const best = GSVoice.getBestVoice(voices, lang);
  if (best) u.voice = best;

  if (statusEl) statusEl.textContent = `Playing with: ${best ? best.name : 'default voice'}`;
  if (activeBtn) activeBtn.classList.add('playing');

  const cleanup = () => {
    if (statusEl) statusEl.textContent = '';
    if (activeBtn) activeBtn.classList.remove('playing');
    currentUtterance = null;
  };

  u.onend = cleanup;
  u.onerror = () => {
    if (statusEl) statusEl.textContent = 'Speech error';
    cleanup();
  };

  currentUtterance = u;
  speechSynthesis.speak(u);
}

function stop() {
  speechSynthesis.cancel();
  currentUtterance = null;
  const status = document.getElementById('test-status');
  if (status) status.textContent = '';
}

function initPopup() {
  const testText = document.getElementById('test-text');
  const playSource = document.getElementById('play-source');
  const playTarget = document.getElementById('play-target');
  const stopBtn = document.getElementById('stop');
  const status = document.getElementById('test-status');
  const optionsLink = document.getElementById('open-options');
  const badge = document.getElementById('browser-badge');
  const autoShowIcon = document.getElementById('auto-show-icon');
  const targetLangSelect = document.getElementById('target-lang');
  const speechRate = document.getElementById('speech-rate');
  const rateValue = document.getElementById('rate-value');

  badge.textContent = GSVoice.IS_EDGE ? 'Edge — Best online neural voices' : 'Chrome — High quality voices';

  loadSettings().then(applySettingsToUI);

  autoShowIcon.addEventListener('change', () => {
    saveSettings({ autoShowIcon: autoShowIcon.checked });
  });

  targetLangSelect.addEventListener('change', () => {
    saveSettings({ targetLang: targetLangSelect.value });
    updateDirectionHint(targetLangSelect.value);
  });

  speechRate.addEventListener('input', () => {
    rateValue.textContent = `${Number(speechRate.value).toFixed(2)}x`;
  });
  speechRate.addEventListener('change', () => {
    saveSettings({ speechRate: Number(speechRate.value) });
  });

  playSource.addEventListener('click', async () => {
    const text = testText.value.trim() || 'Hallo, wie geht es dir heute?';
    const settings = await loadSettings();

    if (text === lastResult.original && lastResult.sourceLang) {
      speak(text, lastResult.sourceLang, status, playSource);
      return;
    }

    status.textContent = 'Detecting language...';
    try {
      const result = await GSTranslate.translateAuto(text, settings.targetLang);
      lastResult = {
        original: text,
        translation: result.translated,
        sourceLang: GSVoice.langToBCP47(result.detectedLang),
        targetLang: GSVoice.langToBCP47(result.targetLang),
      };
      status.textContent = '';
      speak(text, lastResult.sourceLang, status, playSource);
    } catch (e) {
      status.textContent = 'Could not detect language, using default.';
      speak(text, 'en-US', status, playSource);
    }
  });

  playTarget.addEventListener('click', async () => {
    const text = testText.value.trim() || 'Hallo, wie geht es dir heute?';
    const settings = await loadSettings();

    if (text === lastResult.original && lastResult.translation) {
      speak(lastResult.translation, lastResult.targetLang, status, playTarget);
      return;
    }

    status.textContent = 'Translating...';
    try {
      const result = await GSTranslate.translateAuto(text, settings.targetLang);
      lastResult = {
        original: text,
        translation: result.translated,
        sourceLang: GSVoice.langToBCP47(result.detectedLang),
        targetLang: GSVoice.langToBCP47(result.targetLang),
      };
      status.textContent = '';
      speak(lastResult.translation, lastResult.targetLang, status, playTarget);
    } catch (e) {
      status.textContent = 'Translation failed.';
    }
  });

  stopBtn.addEventListener('click', stop);

  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  GSVoice.waitForVoices();

  testText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      playSource.click();
    }
  });

  testText.addEventListener('input', () => {
    if (testText.value.trim() !== lastResult.original) {
      lastResult = { original: '', translation: '', sourceLang: 'en-US', targetLang: 'de-DE' };
    }
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
