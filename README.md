# edit-mode.js

Inline text editing for static HTML pages.

`edit-mode.js` enables in-browser editing for common text elements and exports a new HTML file with text updates applied to the original source.

## Installation

Add the script before `</body>`:

```html
<script src="edit-mode.js"></script>
```

## Usage

Enable edit mode with one of the following:

- `Ctrl+E` / `Cmd+E`
- `#edit` URL hash
- `?edit=true` query parameter

When edit mode is active:

- Click text and edit in place.
- Click `Save as new file` to download updated HTML.
- Click `Exit` to leave edit mode.

On exit, `#edit` and `?edit=true` are removed from the URL.

## Editable Elements

Only elements with direct text content are editable.

Supported tags:
`h1` `h2` `h3` `h4` `h5` `h6` `p` `span` `li` `a` `button` `label` `td` `th` `blockquote` `figcaption` `caption` `dt` `dd` `summary` `legend`

## Behavior

- Source-first save: text changes are patched into the original HTML source, not exported from `document.outerHTML`.
- Script removal on save: the `<script ...edit-mode...>` tag is removed from the downloaded file.
- Navigation protection: links are disabled while edit mode is active.
- Local-file support: works on `file://` URLs (uses `XMLHttpRequest` to read source).

## Save Strategy

1. Load original page source (`fetch` on http/https, `XMLHttpRequest` on `file://`).
2. Store original `textContent` for editable nodes.
3. Compare original and current text on save.
4. Apply replacements to original source using whitespace-tolerant matching.
5. Download the patched HTML.

## Limitations

- Text-only editor: no element add/remove, layout editing, or style editing.
- Duplicate source text: when identical text appears multiple times, replacement targets the first match.
- Source access required: if original source cannot be fetched (for example due to CORS), fallback save uses DOM export.
