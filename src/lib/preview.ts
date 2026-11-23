/**
 * Turns a plain file map into a single self-contained HTML document that can
 * run inside a sandboxed iframe.
 *
 * Generated projects reference CSS, JS, images and fonts with relative paths.
 * A blob URL would break those references, so instead everything reachable
 * from the entry document is inlined as a data URL. That keeps previews
 * offline, sandbox-friendly and instant.
 */

export interface PreviewDoc {
  html: string;
  entry: string | null;
}

const MIME: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

function isTextual(mime: string): boolean {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime === 'image/svg+xml'
  );
}

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function dataUrlFor(path: string, content: string): string {
  const mime = mimeFor(path);
  if (isTextual(mime)) {
    return 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(content);
  }
  return 'data:' + mime + ';base64,' + encodeUtf8Base64(content);
}

function getAttr(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp('(?:^|\\s)' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'),
  );
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? '';
}

function stripAttr(tag: string, name: string): string {
  return tag.replace(
    new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'),
    '',
  );
}

function isExternal(ref: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref.trim());
}

/** Resolve a relative reference against the referencing file's folder. */
export function resolveProjectPath(
  files: Record<string, string>,
  basePath: string,
  rawRef: string,
): string | null {
  const ref = rawRef.trim();
  if (!ref || isExternal(ref)) return null;

  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return null;

  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep the raw form */
  }

  const baseDir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/') + 1) : '';
  const stack = decoded.startsWith('/') ? [] : baseDir.split('/').filter(Boolean);

  for (const part of decoded.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }

  const path = stack.join('/');
  return Object.prototype.hasOwnProperty.call(files, path) ? path : null;
}

function inlineCssAssets(files: Record<string, string>, css: string, cssPath: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _quote: string, ref: string) => {
    const path = resolveProjectPath(files, cssPath, ref);
    if (!path) return match;
    return 'url("' + dataUrlFor(path, files[path]) + '")';
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pickEntry(files: Record<string, string>, preferred?: string | null): string | null {
  if (preferred && Object.prototype.hasOwnProperty.call(files, preferred)) return preferred;
  if (Object.prototype.hasOwnProperty.call(files, 'index.html')) return 'index.html';

  const htmlFiles = Object.keys(files)
    .filter((path) => /\.html?$/i.test(path))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

  return htmlFiles[0] ?? null;
}

function emptyPreview(): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    ':root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;',
    'background:#08090d;color:#8b93a7;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;text-align:center;}',
    '.card{padding:32px;border:1px solid rgba(255,255,255,.08);border-radius:16px;max-width:360px;}',
    'h1{font-size:15px;color:#e7ebf5;margin:0 0 6px;}p{margin:0;}',
    '</style></head><body><div class="card"><h1>Nothing to preview yet</h1><p>Ask the agent to build index.html.</p></div></body></html>',
  ].join('');
}

export function buildPreview(files: Record<string, string>, preferredEntry?: string | null): PreviewDoc {
  const entry = pickEntry(files, preferredEntry);
  if (!entry) return { html: emptyPreview(), entry: null };

  let html = files[entry];

  // Inline project stylesheets.
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = getAttr(tag, 'href');
    const rel = (getAttr(tag, 'rel') ?? '').toLowerCase();
    if (!href || !rel.includes('stylesheet')) return tag;
    const path = resolveProjectPath(files, entry, href);
    if (!path) return tag;
    const css = inlineCssAssets(files, files[path], path);
    return '<style data-codefly-src="' + escapeHtml(path) + '">\n' + css + '\n</style>';
  });

  // Inline project scripts so ES modules and classic scripts both resolve.
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs: string, body: string) => {
    const src = getAttr(attrs, 'src');
    if (!src) return match;
    const path = resolveProjectPath(files, entry, src);
    if (!path) return match;

    const cleaned = stripAttr(attrs, 'src').replace(/\s+integrity\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '').trim();
    const code = files[path];
    return '<script' + (cleaned ? ' ' + cleaned : '') + ' data-codefly-src="' + escapeHtml(path) + '">\n' + code + '\n</script>';
  });

  // Replace remaining asset references (img/src, video/poster, anchors, icons).
  html = html.replace(
    /\s(src|href|poster)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, attr: string, _all: string, doubleQuoted?: string, singleQuoted?: string, bare?: string) => {
      const ref = doubleQuoted ?? singleQuoted ?? bare ?? '';
      const path = resolveProjectPath(files, entry, ref);
      if (!path) return match;
      return ' ' + attr + '="' + dataUrlFor(path, files[path]) + '"';
    },
  );

  const reporter = [
    '<script data-codefly-runtime="1">',
    '(function(){',
    'var mem={};try{window.localStorage.getItem("__codefly_probe__")}catch(e){',
    'var shim={getItem:function(k){return Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null},setItem:function(k,v){mem[k]=String(v)},removeItem:function(k){delete mem[k]},clear:function(){mem={}},key:function(i){return Object.keys(mem)[i]||null},get length(){return Object.keys(mem).length}};',
    'try{Object.defineProperty(window,"localStorage",{value:shim,configurable:true})}catch(e2){}',
    'try{Object.defineProperty(window,"sessionStorage",{value:shim,configurable:true})}catch(e3){}',
    '}',
    'function send(m){try{parent.postMessage({source:"codefly-preview",type:"error",message:String(m)},"*")}catch(e){}}',
    'window.addEventListener("error",function(e){send((e.message||"Script error")+(e.lineno?" (line "+e.lineno+")":""))});',
    'window.addEventListener("unhandledrejection",function(e){var r=e.reason;send("Unhandled promise rejection: "+((r&&r.message)||r))});',
    'var original=console.error;console.error=function(){send(Array.prototype.slice.call(arguments).join(" "));original.apply(console,arguments)};',
    '})();',
    '</script>',
  ].join('');

  if (!/^\s*<!doctype/i.test(html)) html = '<!doctype html>\n' + html;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (tag) => tag + '\n<meta charset="utf-8">\n<base target="_blank">\n' + reporter);
  } else {
    html = '<meta charset="utf-8"><base target="_blank">' + reporter + html;
  }

  return { html, entry };
}
