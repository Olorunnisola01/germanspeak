/**
 * GermanSpeak Options Page
 */

const { GSVoice } = window;

const DEFAULT_SETTINGS = {
  autoShowIcon: true,
  speechRate: 1.0,
  targetLang: 'auto',
};

let voices = [];

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

function saveSettings(partial) {
  chrome.storage.sync.set(partial, () => {
    const note = document.getElementById('save-note');
    note.classList.add('visible');
    setTimeout(() => note.classList.remove('visible'), 1200);
  });
}

async function renderVoices() {
  voices = await GSVoice.waitForVoices();
  const container = document.getElementById('voice-list');
  container.innerHTML = '';

  const deVoices = voices
    .map((v) => ({ v, s: GSVoice.scoreVoice(v, 'de-DE') }))
    .filter((x) => x.s > 0 || (x.v.lang || '').toLowerCase().startsWith('de'))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);

  const enVoices = voices
    .map((v) => ({ v, s: GSVoice.scoreVoice(v, 'en-US') }))
    .filter((x) => x.s > 0 || (x.v.lang || '').toLowerCase().startsWith('en'))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);

  if (deVoices.length === 0 && enVoices.length === 0) {
    container.innerHTML = '<div style="color:#64748b">No voices found. Try refreshing.</div>';
    return;
  }

  const titleDe = document.createElement('div');
  titleDe.style.cssText = 'font-size:11px;font-weight:700;color:#64748b;margin:6px 0 4px;';
  titleDe.textContent = 'German voices (best first)';
  container.appendChild(titleDe);
  deVoices.forEach(({ v, s }) => container.appendChild(createVoiceRow(v, s)));

  const titleEn = document.createElement('div');
  titleEn.style.cssText = 'font-size:11px;font-weight:700;color:#64748b;margin:12px 0 4px;';
  titleEn.textContent = 'English voices (best first)';
  container.appendChild(titleEn);
  enVoices.forEach(({ v, s }) => container.appendChild(createVoiceRow(v, s)));
}

function createVoiceRow(voice, score) {
  const div = document.createElement('div');
  div.className = 'voice';

  const left = document.createElement('div');
  left.innerHTML = `
    <div class="voice-name">${voice.name}</div>
    <div class="voice-lang">${voice.lang}</div>
  `;

  const right = document.createElement('div');
  right.style.textAlign = 'right';

  let badges = '';
  const n = voice.name.toLowerCase();
  if (/natural|online|neural/i.test(n)) badges += `<span class="badge ${GSVoice.IS_EDGE ? 'edge' : ''}">High quality</span>`;
  if (/google/i.test(n)) badges += ` <span class="badge">Google</span>`;
  if (score >= 25) badges += ` <span class="badge">Top pick</span>`;

  right.innerHTML = badges || `<span class="badge" style="background:#e2e8f0;color:#475569">Available</span>`;

  div.appendChild(left);
  div.appendChild(right);
  return div;
}

async function testSpeak(lang) {
  const text = lang.startsWith('de')
    ? 'Guten Tag! Dies ist die beste Stimme für Deutsch.'
    : 'Hello! This is the highest quality English voice available.';

  speechSynthesis.cancel();
  const settings = await loadSettings();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const base = settings.speechRate || 1.0;
  u.rate = lang.startsWith('de') ? base * 0.96 : base;

  const best = GSVoice.getBestVoice(voices, lang);
  if (best) u.voice = best;

  speechSynthesis.speak(u);
}

async function initOptions() {
  const settings = await loadSettings();

  const autoShowIcon = document.getElementById('auto-show-icon');
  const targetLang = document.getElementById('target-lang');
  const speechRate = document.getElementById('speech-rate');
  const rateHint = document.getElementById('rate-hint');

  autoShowIcon.checked = settings.autoShowIcon;
  targetLang.value = settings.targetLang;
  speechRate.value = settings.speechRate;
  rateHint.textContent = `${Number(settings.speechRate).toFixed(2)}x`;

  autoShowIcon.addEventListener('change', () => {
    saveSettings({ autoShowIcon: autoShowIcon.checked });
  });

  targetLang.addEventListener('change', () => {
    saveSettings({ targetLang: targetLang.value });
  });

  speechRate.addEventListener('input', () => {
    rateHint.textContent = `${Number(speechRate.value).toFixed(2)}x`;
  });
  speechRate.addEventListener('change', () => {
    saveSettings({ speechRate: Number(speechRate.value) });
  });

  renderVoices();

  document.getElementById('refresh-voices').addEventListener('click', () => {
    document.getElementById('voice-list').innerHTML = '<div style="color:#64748b">Refreshing...</div>';
    speechSynthesis.getVoices();
    setTimeout(renderVoices, 250);
  });

  document.getElementById('test-source').addEventListener('click', () => testSpeak('de-DE'));
  document.getElementById('test-target').addEventListener('click', () => testSpeak('en-US'));
}

document.addEventListener('DOMContentLoaded', initOptions);
