#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function printUsage() {
  console.error(
    'Usage: node scripts/restore-original-texts.js ' +
    '--original <original.html> --edited <edited.html> --out <restored.html>'
  );
}

function parseArgs(argv) {
  const args = {};

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith('--')) continue;
    if (!value || value.startsWith('--')) {
      throw new Error('Missing value for argument: ' + key);
    }
    args[key.slice(2)] = value;
    i += 1;
  }

  if (!args.original || !args.edited || !args.out) {
    printUsage();
    process.exit(1);
  }

  return args;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBodyContentStartIndex(html) {
  const bodyOpen = html.match(/<body\b[^>]*>/i);
  if (!bodyOpen || bodyOpen.index == null) return 0;
  return bodyOpen.index + bodyOpen[0].length;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number.parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

function getBodyInnerHTML(html) {
  const open = html.match(/<body\b[^>]*>/i);
  const close = html.match(/<\/body>/i);
  if (!open || open.index == null || !close || close.index == null) return html;
  const start = open.index + open[0].length;
  const end = close.index;
  if (end <= start) return html;
  return html.slice(start, end);
}

function collectBodyTextTokens(html) {
  const body = getBodyInnerHTML(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  const tokens = [];
  const regex = />([^<>]+)</g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    const text = decodeEntities(match[1]).trim();
    if (!text) continue;
    tokens.push(text);
  }
  return tokens;
}

function buildEdits(originalHtml, editedHtml) {
  const originalTexts = collectBodyTextTokens(originalHtml);
  const editedTexts = collectBodyTextTokens(editedHtml);

  if (originalTexts.length === 0 || editedTexts.length === 0) {
    throw new Error('Could not detect editable text blocks in one of the files.');
  }

  const count = Math.min(originalTexts.length, editedTexts.length);
  const edits = [];

  for (let i = 0; i < count; i += 1) {
    const oldText = originalTexts[i];
    const newText = editedTexts[i];
    if (oldText !== newText) {
      edits.push({ oldText, newText });
    }
  }

  return {
    edits,
    originalCount: originalTexts.length,
    editedCount: editedTexts.length
  };
}

function applyEditsToSource(html, edits) {
  let result = html;
  let appliedCount = 0;
  let cursor = getBodyContentStartIndex(result);

  for (const edit of edits) {
    if (!edit.oldText || !edit.newText || edit.oldText === edit.newText) continue;

    const words = edit.oldText.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const pattern = words.map(escapeRegex).join('[\\s\\n]+');
    const regex = new RegExp(pattern, 'g');

    regex.lastIndex = cursor;
    const match = regex.exec(result);
    if (!match || match.index == null) continue;

    const start = match.index;
    const end = start + match[0].length;
    result = result.slice(0, start) + edit.newText + result.slice(end);
    cursor = start + edit.newText.length;
    appliedCount += 1;
  }

  return { html: result, appliedCount };
}

function main() {
  const { original, edited, out } = parseArgs(process.argv);

  const originalPath = path.resolve(process.cwd(), original);
  const editedPath = path.resolve(process.cwd(), edited);
  const outPath = path.resolve(process.cwd(), out);

  const originalHtml = fs.readFileSync(originalPath, 'utf8');
  const editedHtml = fs.readFileSync(editedPath, 'utf8');

  const { edits, originalCount, editedCount } = buildEdits(originalHtml, editedHtml);

  if (edits.length === 0) {
    fs.writeFileSync(outPath, originalHtml, 'utf8');
    console.log('No text differences found. Wrote original file to: ' + outPath);
    return;
  }

  const patched = applyEditsToSource(originalHtml, edits);
  fs.writeFileSync(outPath, patched.html, 'utf8');

  console.log('Original text blocks:', originalCount);
  console.log('Edited text blocks:', editedCount);
  console.log('Detected text edits:', edits.length);
  console.log('Applied edits:', patched.appliedCount);
  console.log('Wrote restored file:', outPath);

  if (patched.appliedCount < edits.length) {
    console.error(
      'Warning: some edits could not be mapped back to the original source. ' +
      'Check the output manually.'
    );
    process.exitCode = 2;
  }

  if (originalCount !== editedCount) {
    console.error(
      'Warning: editable block counts differ between files. ' +
      'Mapping is best-effort only.'
    );
  }
}

main();
