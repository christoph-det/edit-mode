# edit-mode.js

Inline text editing for static HTML pages.

`edit-mode.js` enables in-browser editing for common text elements and downloads a new HTML file with your text changes.

## Demo Video

<video src="https://github.com/user-attachments/assets/b3b39c90-cb71-45da-a591-b288171c82c1" controls muted playsinline width="100%"></video>


## Installation

Add the script before `</body>`:

```html
<script src="edit-mode.js"></script>
```

## Activation

Edit mode can be toggled with:

- `Ctrl+E` / `Cmd+E`
- `Ctrl+Shift+E` / `Cmd+Shift+E` (fallback in browsers that reserve `Ctrl/Cmd+E`)
- `#edit` URL hash
- `?edit=true` query parameter

When edit mode is disabled, `#edit` and `?edit=true` are removed from the URL.
Changing the hash to `#edit` after page load also activates edit mode.

## Editing Workflow

1. Activate edit mode.
2. Click any editable text and change it inline.
3. Click `Save as new file` to download the updated HTML.
4. Click `Exit` to leave edit mode.

While edit mode is active, links are blocked to prevent accidental navigation.

## Save Behavior

1. The script tries to load the original page source.
2. It records text changes for editable elements.
3. It patches those changes into the original source (source-preserving mode).
4. If patching is incomplete or source loading failed, it falls back to DOM export.

By default, the saved file removes the `<script ...edit-mode...>` tag.
This is controlled by `REMOVE_SCRIPT_ON_SAVE` in `edit-mode.js`.

## Editable Elements

Only elements with direct text nodes are editable.

Supported tags:
`h1` `h2` `h3` `h4` `h5` `h6` `p` `span` `li` `a` `button` `label` `td` `th` `blockquote` `figcaption` `caption` `dt` `dd` `summary` `legend`

## Limitations

- Text content only (no layout/style/DOM structure editing).
- Source patching is text-match based.
- If identical text appears multiple times, matching may target a different instance than expected.
- Loading original source is required for source-preserving mode.

## `file://` and Fetching Source

For `file://` URLs, the script uses `XMLHttpRequest` to read the current file.
Depending on browser security settings, this can fail in some environments.

If loading original source fails (for example `file://` restrictions or CORS-like policy behavior), save falls back to DOM export.

## Recovery Script (when source fetch fails)

If you have:

- the original clean file (before editing), and
- a fallback-saved file containing your updated text

you can rebuild a clean source file with updated text using:

```bash
node scripts/restore-original-texts.js \
  --original path/to/original.html \
  --edited path/to/fallback-saved.html \
  --out path/to/restored.html
```

What it does:

1. Extracts body text blocks from both files.
2. Computes text differences by source order.
3. Applies those changes to the original source layout.
4. Writes a restored output file.

If some edits cannot be mapped, the script prints a warning and exits with code `2`.

## GitHub Pages Demo

Deployment workflow: `.github/workflows/deploy-demo-pages.yml`

1. Push the repository to GitHub.
2. In repository settings, set `Pages -> Source` to `GitHub Actions`.
3. Push to `main` (or trigger the workflow manually).
4. Open `/demo.html` on your Pages URL.

Example:
`https://<user>.github.io/<repo>/demo.html`

## Cache Note (Pages)

If behavior looks outdated after deployment, force refresh (`Cmd/Ctrl+Shift+R`).
For stronger cache busting, version the script URL in `demo.html`, for example:

```html
<script src="edit-mode.js?v=2026-02-12-1"></script>
```

## License

MIT
