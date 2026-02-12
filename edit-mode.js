/**
 * edit-mode.js — Drop-in inline text editor for static HTML pages
 *
 * Add one script tag. Edit text. Save a clean file.
 *
 * Usage: <script src="edit-mode.js"></script> (before </body>)
 *
 * Activate (3 ways):
 *   1. Ctrl+E (Windows/Linux) / Cmd+E (Mac)
 *   2. Append #edit to the URL  → works on local file:// URLs too
 *   3. Append ?edit=true        → works on hosted sites (http/https)
 *
 * Deactivate: Ctrl+E / Cmd+E again, or click the ✕ button
 *
 * How it works:
 *   On load, the original HTML source is fetched and kept in memory.
 *   Edits are collected as text diffs and patched into the original source.
 *   The saved file is byte-for-byte identical to the original — except
 *   for the text you changed. No DOM artifacts, no injected styles,
 *   no Tailwind dumps, no browser extension pollution.
 *   The script tag removes itself from the saved output.
 *
 * https://github.com/chdethloff/edit-mode
 * MIT License
 */
(function () {
  'use strict';

  const EDITABLE_SELECTORS = 'h1,h2,h3,h4,h5,h6,p,span,li,a,button,label,td,th,blockquote,figcaption,caption,dt,dd,summary,legend';
  const TOOLBAR_ID = 'edit-toolbar';
  const EDIT_CLASS = 'editable-element';

  let editActive = false;
  let styleEl = null;
  let toolbarEl = null;

  // ── Capture original HTML source BEFORE any JS modifies the DOM ──
  let originalHTML = null;

  /**
   * Snapshot original text for every editable element so we can detect
   * what the user changed later.
   */
  function snapshotOriginalTexts() {
    document.querySelectorAll(EDITABLE_SELECTORS).forEach(el => {
      if (el.closest('#' + TOOLBAR_ID)) return;
      if (!isTextNode(el)) return;
      if (!el.hasAttribute('data-edit-orig')) {
        el.setAttribute('data-edit-orig', el.textContent);
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  function isTextNode(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return true;
    }
    return false;
  }

  function preventNav(e) { e.preventDefault(); }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function clearEditFlagsFromURL() {
    let changed = false;
    const url = new URL(window.location.href);

    if (url.hash.toLowerCase() === '#edit') {
      url.hash = '';
      changed = true;
    }

    if (url.searchParams.get('edit') === 'true') {
      url.searchParams.delete('edit');
      changed = true;
    }

    if (changed) {
      const nextURL = url.pathname + url.search + url.hash;
      window.history.replaceState(null, '', nextURL);
    }
  }

  // ── Enable / Disable ────────────────────────────────────

  function enableEdit() {
    editActive = true;
    snapshotOriginalTexts();

    document.querySelectorAll(EDITABLE_SELECTORS).forEach(el => {
      if (el.closest('#' + TOOLBAR_ID)) return;
      if (!isTextNode(el)) return;

      el.setAttribute('contenteditable', 'true');
      el.classList.add(EDIT_CLASS);
    });

    // Prevent ALL links from navigating/scrolling
    document.querySelectorAll('a').forEach(el => {
      if (el.closest('#' + TOOLBAR_ID)) return;
      el.addEventListener('click', preventNav);
      el.dataset.editBlocked = 'true';
    });

    ensureToolbar();
    toolbarEl.style.display = 'block';
  }

  function disableEdit() {
    editActive = false;

    document.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
      el.classList.remove(EDIT_CLASS);
    });

    document.querySelectorAll('a[data-edit-blocked]').forEach(el => {
      el.removeEventListener('click', preventNav);
      delete el.dataset.editBlocked;
    });

    if (toolbarEl) toolbarEl.style.display = 'none';
    clearEditFlagsFromURL();
  }

  // ── Save (source-patching approach) ─────────────────────

  /**
   * Collect text edits: elements where current text differs from snapshot.
   */
  function collectEdits() {
    const edits = [];
    document.querySelectorAll('[data-edit-orig]').forEach(el => {
      const oldText = el.getAttribute('data-edit-orig');
      const newText = el.textContent;
      if (oldText !== newText) {
        edits.push({ oldText: oldText.trim(), newText: newText.trim() });
      }
    });
    return edits;
  }

  /**
   * Apply text edits to the original HTML source string.
   * Searches for old text (with flexible whitespace) and replaces it.
   * Preserves all original formatting, tags, and whitespace.
   */
  function applyEditsToSource(html, edits) {
    let result = html;
    for (const edit of edits) {
      if (!edit.oldText || !edit.newText || edit.oldText === edit.newText) continue;

      const words = edit.oldText.split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;

      const pattern = words.map(escapeRegex).join('[\\s\\n]+');
      const regex = new RegExp(pattern);

      // Replace only first occurrence to avoid unintended replacements
      result = result.replace(regex, edit.newText);
    }
    return result;
  }

  /**
   * Remove the edit-mode <script> tag from the HTML source.
   */
  function removeEditModeScript(html) {
    return html.replace(/\s*<script[^>]*edit-mode[^>]*><\/script>\s*/gi, '\n');
  }

  function saveFile() {
    const edits = collectEdits();

    if (!originalHTML) {
      alert('Could not load original source. Falling back to DOM export (some formatting may change).');
      saveFallback();
      return;
    }

    let html = applyEditsToSource(originalHTML, edits);
    html = removeEditModeScript(html);

    downloadFile(html);
    showSaveFeedback();
  }

  /**
   * Fallback: uses outerHTML (old behavior). Only if source fetch fails.
   */
  function saveFallback() {
    disableEdit();
    if (toolbarEl) toolbarEl.remove();
    if (styleEl) styleEl.remove();

    const scripts = document.querySelectorAll('script');
    const selfScript = Array.from(scripts).find(s =>
      s.src && s.src.includes('edit-mode')
    );
    if (selfScript) selfScript.remove();

    const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    injectStyles();
    document.body.appendChild(toolbarEl);
    if (selfScript) document.body.appendChild(selfScript);
    enableEdit();

    downloadFile(html);
    showSaveFeedback();
  }

  function downloadFile(html) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const now = new Date();
    const d = now.toISOString().slice(0, 10).replace(/-/g, '');
    const t = now.toTimeString().slice(0, 5).replace(':', '');
    const basename = document.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '');
    a.download = (basename || 'page') + '_' + d + '_' + t + '.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function showSaveFeedback() {
    const btn = document.getElementById('edit-save-btn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '\u2705 Saved!';
      setTimeout(() => (btn.textContent = orig), 2000);
    }
  }

  // ── Toolbar ─────────────────────────────────────────────

  function ensureToolbar() {
    if (toolbarEl) return;

    toolbarEl = document.createElement('div');
    toolbarEl.id = TOOLBAR_ID;
    toolbarEl.style.display = 'none';
    toolbarEl.innerHTML = `
      <div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;
                  display:flex;gap:10px;align-items:center;
                  background:#1a1a2e;padding:12px 20px;border-radius:16px;
                  box-shadow:0 8px 32px rgba(0,0,0,.3);border:1px solid rgba(99,102,241,.3);
                  font-family:system-ui,-apple-system,sans-serif;white-space:nowrap;">
        <div style="display:flex;align-items:center;gap:8px;padding-right:14px;border-right:1px solid rgba(255,255,255,.1);">
          <div style="width:10px;height:10px;border-radius:50%;background:#22c55e;animation:em-pulse 2s infinite;"></div>
          <span style="color:rgba(255,255,255,.7);font-size:13px;font-weight:500;">Edit Mode</span>
        </div>
        <button id="edit-save-btn"
          style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;
                 padding:8px 18px;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;
                 font-family:inherit;transition:all .2s;">
          \ud83d\udcbe Save as new file
        </button>
        <button id="edit-cancel-btn"
          style="background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);
                 border:1px solid rgba(255,255,255,.1);padding:8px 14px;border-radius:10px;
                 cursor:pointer;font-size:13px;font-family:inherit;transition:all .2s;">
          \u2715 Exit
        </button>
        <div style="padding-left:10px;border-left:1px solid rgba(255,255,255,.1);">
          <span style="color:rgba(255,255,255,.3);font-size:11px;">Ctrl+E \u00b7 #edit in URL</span>
        </div>
      </div>`;
    document.body.appendChild(toolbarEl);

    document.getElementById('edit-save-btn').addEventListener('click', saveFile);
    document.getElementById('edit-cancel-btn').addEventListener('click', () => {
      if (confirm('Exit Edit Mode? Unsaved changes will be lost.')) {
        disableEdit();
        location.reload();
      }
    });
  }

  // ── Styles ──────────────────────────────────────────────

  function injectStyles() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = 'edit-mode-styles';
    styleEl.textContent = `
      @keyframes em-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      .${EDIT_CLASS} {
        outline: 1px dashed transparent !important;
        transition: outline .2s, background .2s !important;
        cursor: text !important;
        border-radius: 4px;
        min-height: 1em;
      }
      .${EDIT_CLASS}:hover {
        outline: 1px dashed rgba(99,102,241,.4) !important;
        background: rgba(99,102,241,.04) !important;
      }
      .${EDIT_CLASS}:focus {
        outline: 2px solid rgba(99,102,241,.6) !important;
        background: rgba(99,102,241,.06) !important;
      }
      #edit-save-btn:hover  { filter:brightness(1.15); transform:scale(1.03); }
      #edit-cancel-btn:hover { background:rgba(255,255,255,.15)!important; color:#fff!important; }
    `;
    document.head.appendChild(styleEl);
  }

  // ── Fetch original source ───────────────────────────────

  function fetchOriginalSource() {
    const loc = window.location;
    const cleanURL = loc.href.replace(/#.*$/, '').replace(/\?.*$/, '');

    if (loc.protocol === 'file:') {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', cleanURL, true);
      xhr.responseType = 'text';
      xhr.onload = function () {
        if (xhr.status === 0 || xhr.status === 200) {
          originalHTML = xhr.responseText;
        }
      };
      xhr.send();
    } else {
      fetch(loc.pathname + loc.search, { cache: 'no-store' })
        .then(r => r.text())
        .then(text => { originalHTML = text; })
        .catch(() => {});
    }
  }

  // ── Init ────────────────────────────────────────────────

  fetchOriginalSource();
  injectStyles();
  ensureToolbar();

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      editActive ? disableEdit() : enableEdit();
    }
  });

  const hash = window.location.hash.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  if (hash === '#edit' || params.get('edit') === 'true') {
    enableEdit();
  }

})();
