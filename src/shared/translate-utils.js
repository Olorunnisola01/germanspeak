/**
 * GermanSpeak - Shared translation utilities.
 * Used by content.js and background.js (loaded as a plain script /
 * importScripts, exposes a single global: GSTranslate).
 */
(function (global) {
  const MAX_CACHE_ENTRIES = 60;
  const cache = new Map();

  function cacheKey(text, sourceLang, targetLang) {
    return `${sourceLang}>${targetLang}:${text}`;
  }

  function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    // Refresh recency
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  function cacheSet(key, value) {
    cache.set(key, value);
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
  }

  /**
   * Translate text using Google Translate's free public endpoint.
   * @returns {Promise<{translated: string, detectedLang: string}>}
   */
  async function translateText(text, sourceLang = 'auto', targetLang = 'en') {
    if (!text || !text.trim()) {
      throw new Error('No text to translate');
    }

    const safeText = text.slice(0, 4500);
    const key = cacheKey(safeText, sourceLang, targetLang);
    const cached = cacheGet(key);
    if (cached) return cached;

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(safeText)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Translate failed: ${response.status}`);
    }

    const data = await response.json();

    let translated = '';
    if (Array.isArray(data[0])) {
      translated = data[0].map((part) => part[0] || '').join('');
    }

    const result = {
      translated: translated.trim(),
      detectedLang: data[2] || (sourceLang === 'auto' ? '' : sourceLang),
    };

    cacheSet(key, result);
    return result;
  }

  /**
   * Translate text, automatically picking the target language based on the
   * detected source language:
   *  - If the source is German (or anything other than English), translate to English.
   *  - If the source is English, translate to German instead.
   *
   * Pass `targetOverride` ('de' | 'en') to force a fixed direction.
   *
   * @returns {Promise<{translated: string, detectedLang: string, targetLang: string}>}
   */
  async function translateAuto(text, targetOverride = 'auto') {
    if (targetOverride === 'de' || targetOverride === 'en') {
      const result = await translateText(text, 'auto', targetOverride);
      return { ...result, targetLang: targetOverride };
    }

    // First pass: try translating to English (covers the most common case).
    let result = await translateText(text, 'auto', 'en');
    let targetLang = 'en';

    const detectedBase = (result.detectedLang || '').toLowerCase().slice(0, 2);
    if (detectedBase === 'en') {
      // The source text is already English -> translate to German instead.
      result = await translateText(text, 'auto', 'de');
      targetLang = 'de';
    }

    return { ...result, targetLang };
  }

  global.GSTranslate = {
    translateText,
    translateAuto,
  };
})(typeof window !== 'undefined' ? window : self);
