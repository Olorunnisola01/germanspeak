/**
 * GermanSpeak - Shared voice selection utilities.
 * Used by content.js, popup.js and options.js (loaded as a plain script,
 * exposes a single global: GSVoice).
 */
(function (global) {
  const IS_EDGE = /Edg\//.test(navigator.userAgent);

  // Map of 2-letter language codes (as returned by Google Translate's
  // language detection) to a sensible BCP-47 tag for speechSynthesis.
  const LANG_MAP = {
    de: 'de-DE',
    en: 'en-US',
    fr: 'fr-FR',
    es: 'es-ES',
    it: 'it-IT',
    pt: 'pt-PT',
    nl: 'nl-NL',
    pl: 'pl-PL',
    ru: 'ru-RU',
    tr: 'tr-TR',
    sv: 'sv-SE',
    da: 'da-DK',
    no: 'nb-NO',
    fi: 'fi-FI',
    cs: 'cs-CZ',
    el: 'el-GR',
    ja: 'ja-JP',
    ko: 'ko-KR',
    zh: 'zh-CN',
    ar: 'ar-SA',
  };

  const FLAG_MAP = {
    de: '🇩🇪',
    en: '🇬🇧',
    fr: '🇫🇷',
    es: '🇪🇸',
    it: '🇮🇹',
    pt: '🇵🇹',
    nl: '🇳🇱',
    pl: '🇵🇱',
    ru: '🇷🇺',
    tr: '🇹🇷',
    sv: '🇸🇪',
    da: '🇩🇰',
    no: '🇳🇴',
    fi: '🇫🇮',
    cs: '🇨🇿',
    el: '🇬🇷',
    ja: '🇯🇵',
    ko: '🇰🇷',
    zh: '🇨🇳',
    ar: '🇸🇦',
  };

  function langToBCP47(lang) {
    if (!lang) return 'en-US';
    const base = lang.toLowerCase().slice(0, 2);
    return LANG_MAP[base] || lang;
  }

  function flagFor(lang) {
    if (!lang) return '🌐';
    const base = lang.toLowerCase().slice(0, 2);
    return FLAG_MAP[base] || '🌐';
  }

  function scoreVoice(voice, targetLang) {
    const name = (voice.name || '').toLowerCase();
    const lang = (voice.lang || '').toLowerCase();
    let score = 0;

    const baseLang = targetLang.slice(0, 2).toLowerCase();

    // Language match
    if (lang === targetLang.toLowerCase()) score += 12;
    else if (lang.startsWith(baseLang)) score += 8;
    else if (lang.includes(baseLang)) score += 4;

    // Highest quality indicators (Edge crystal clear online neural voices)
    if (/online.*natural|natural.*online|neural/i.test(name)) score += 20;
    if (/online/i.test(name) && IS_EDGE) score += 16;
    if (/microsoft/i.test(name) && /online/i.test(name)) score += 14;

    // Google high quality voices
    if (/google/i.test(name)) score += 13;

    // Other premium signals
    if (/premium|enhanced|cloud/i.test(name)) score += 9;

    // Known excellent voices (common across browsers)
    if (/katja|jenny|markus|daniel|hedda|conrad|guy|aria|dawn|libby/i.test(name)) score += 7;

    // Penalize lower quality
    if (/desktop|compact|standard/i.test(name)) score -= 6;
    if (/microsoft/i.test(name) && !/online/i.test(name)) score -= 2;

    return score;
  }

  function waitForVoices(timeoutMs = 1200) {
    return new Promise((resolve) => {
      let current = [];
      try { current = speechSynthesis.getVoices(); } catch (_) {}
      if (current && current.length > 0) return resolve(current);

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        let v = [];
        try { v = speechSynthesis.getVoices(); } catch (_) {}
        resolve(v);
      };

      try {
        speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
      } catch (_) {}

      setTimeout(finish, timeoutMs);
    });
  }

  function getBestVoice(voices, lang) {
    if (!voices || voices.length === 0) return null;

    const targetLang = lang;
    const baseLang = targetLang.slice(0, 2).toLowerCase();

    const candidates = voices.filter((v) => (v.lang || '').toLowerCase().startsWith(baseLang));

    const pool = candidates.length > 0 ? candidates : voices.slice();
    pool.sort((a, b) => scoreVoice(b, targetLang) - scoreVoice(a, targetLang));
    return pool[0] || null;
  }

  global.GSVoice = {
    IS_EDGE,
    langToBCP47,
    flagFor,
    scoreVoice,
    waitForVoices,
    getBestVoice,
  };
})(typeof window !== 'undefined' ? window : self);
