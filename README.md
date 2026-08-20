# GermanSpeak — Chrome & Edge Extension

Select **any** text on a page → instant translation (German ↔ English, auto-detected) and
high-quality text-to-speech for both languages.

- **One small floating icon** appears near your selection — click it to open the translation card
- **Auto-detects direction**: German text is translated to English; anything else (e.g. English) is
  translated to German
- Plays the **highest quality voice** available via the Web Speech API
  - **Microsoft Edge**: prefers the excellent online "Natural" / neural cloud voices (crystal clear)
  - **Chrome**: prefers Google voices and other high-quality options
- Right-click menu and a keyboard shortcut (**Alt+Shift+T**) work without needing to click anything
- Settings let you turn the icon on/off, force a translation direction, and adjust speech speed

## Features

- 🌐 Click the floating icon to open a card with the **original text** and its **translation**,
  each with its own flag, language label, and Play button
- 📋 Copy the translation with one click
- ⏹ Stop playback at any time
- Smart positioning — the card stays on screen and flips above/below the selection as needed
- Context menu: **"Translate selection"** and **"Speak selection"**
- Keyboard shortcut: **Alt+Shift+T** translates the current selection
- Settings page shows the best voices detected on your browser and lets you test them

## Installation (Load Unpacked)

### Chrome
1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this entire folder: `german extension`

### Microsoft Edge
1. Go to `edge://extensions`
2. Turn on **Developer mode** (bottom left or sidebar)
3. Click **Load unpacked**
4. Select this entire folder

After loading you will see the GermanSpeak icon in your toolbar.

## How to Use

1. Go to any website (news, Wikipedia, language sites, etc.)
2. **Highlight** (select) a word, phrase, or sentence — in German or English
3. A small circular icon appears near your selection
4. **Click the icon** — a card opens showing:
   - The original text (with its detected language flag) — click to hear it
   - The translation (with its language flag) — click to hear it
   - Play buttons for both, a copy button, and a stop button
5. Click outside the card, press **Esc**, or click the icon again to close it

## Right-click / Context Menu

Select text → right click →
- **🌐 Translate selection (GermanSpeak)** — opens the card with the translation
- **🔊 Speak selection (GermanSpeak)** — opens the card and immediately speaks the original text

## Keyboard Shortcut

Press **Alt+Shift+T** with any text selected to open the translation card without using the mouse.
You can change this shortcut at `chrome://extensions/shortcuts` (or the equivalent `edge://` page).

## Settings

Click the toolbar icon (or open the full settings page) to configure:

- **Show icon on text selection** — turn off to rely only on the context menu / keyboard shortcut
- **Translation direction** — Auto-detect (default), always to German, or always to English
- **Speech speed** — adjust how fast both languages are spoken
- **Best voices** — see which voices GermanSpeak picked on your browser and test them

## Project Structure

```
german extension/
├── manifest.json
├── README.md
├── icons/
│   ├── icon16.jpg
│   ├── icon32.jpg
│   ├── icon48.jpg
│   └── icon128.jpg
└── src/
    ├── background.js       # Context menus, keyboard shortcut, fallback UI
    ├── content.js           # Selection detection, floating icon + card, TTS
    ├── content.css          # Isolated styles for the icon and card
    ├── popup.html / popup.js     # Toolbar popup: quick settings + test
    ├── options.html / options.js # Full settings page + voice list
    └── shared/
        ├── voice-utils.js       # Voice scoring/selection (shared)
        └── translate-utils.js   # Translation + caching (shared)
```

## Technical Notes

- **Manifest V3** — fully modern and future-proof for both Chrome and Edge.
- **No external dependencies** — pure vanilla JS + Web Speech + Google's public translate endpoint.
- Voice selection and translation logic live in `src/shared/` and are reused by the content script,
  popup, options page, and background service worker — no duplicated logic.
- Translations are cached in memory, so re-opening the card for the same text is instant.
- The floating UI is injected inside a **Shadow DOM** so page styles cannot break it.
- Translation calls go to `https://translate.googleapis.com` (the same endpoint many popular
  extensions and tools rely on).

## Troubleshooting

- **No voices / poor quality?**
  Make sure you're online (especially important for Edge neural voices). Reload the extension or
  restart the browser.

- **Icon doesn't appear?**
  Some pages (`chrome://`, `edge://`, certain web apps with heavy isolation) block content scripts.
  Use the right-click menu or the **Alt+Shift+T** shortcut instead — these work via a fallback card
  even on restricted pages.

- **PDFs**
  The browser renders PDFs in an isolated viewer, so the floating icon may not always appear
  automatically. Selecting text and using **right-click → Translate/Speak selection** is the most
  reliable method on PDFs.

- **Translation fails?**
  Requires internet access. The free Google endpoint occasionally has brief hiccups — just try again.

---

Enjoy learning and listening to German (and English)! 🇩🇪🇬🇧🔊
