import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const marker = (html, oldText, replacement) => {
  if (html.split(oldText).length !== 2) throw new Error('Expected one template marker: ' + oldText);
  return html.replace(oldText, replacement);
};

export function buildStandalone({ html = read('index.html'), css = read('style.css'), js = read('demo.js') } = {}) {
  if (/<\/(?:style|script)/i.test(css) || /<\/script/i.test(js)) {
    throw new Error('Unsafe inline content');
  }
  const sha256 = text => createHash('sha256').update(text).digest('base64');
  const policy =
    "default-src 'none'; " +
    "script-src 'sha256-" + sha256(js) + "'; " +
    "style-src 'sha256-" + sha256(css) + "'; " +
    "img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  html = html.replace(
    /<meta http-equiv="Content-Security-Policy" content="[^"]+">/,
    '<meta http-equiv="Content-Security-Policy" content="' + policy + '">'
  );
  if (!html.includes(policy)) throw new Error('CSP tag not found');
  html = marker(html, '<link rel="stylesheet" href="./style.css">', '<style>' + css + '</style>');
  html = marker(html, '<script defer src="./demo.js"></script>', '');
  html = marker(html, '</body>', '<script>' + js + '</script>\n</body>');
  html = marker(html, '<title>Карты Таро · визуальное HTTPS-демо</title>',
    '<title>Карты Таро · автономное демо без интернета</title>');
  if (/\b(?:https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket)\b/.test(html)) {
    throw new Error('Standalone preview cannot reference the network');
  }
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = join(root, 'dist', 'CartTaro_visual_demo.html');
  mkdirSync(dirname(path), { recursive: true });
  const result = buildStandalone();
  writeFileSync(path, result, 'utf8');
  console.log('Created offline visual demo: ' + Buffer.byteLength(result) + ' bytes');
}
