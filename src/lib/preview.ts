/**
 * Builds a self-contained HTML document for the live preview.
 *
 * Projects are plain HTML/CSS/vanilla JS, so local stylesheets and scripts are
 * inlined instead of relying on blob-URL module resolution. Remaining assets
 * (images, fonts, extra pages) become blob URLs. The document runs in a
 * sandboxed iframe without same-origin access; a tiny shim keeps
 * localStorage/sessionStorage usable inside the preview.
 */

export interface PreviewDoc {
  html: string;
  urls: string[];
}

const MIME: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  txt: 'text/plain',
  md: 'text/plain',
  xml: 'application/xml',
  webmanifest: 'application/manifest+json',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

function dirOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** Resolve a relative reference against a directory; null for external refs. */
export function resolveRef(fromDir: string, ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed || EXTERNAL.test(trimmed)) return null;

  const clean = trimmed.split(/[?#]/)[0];
  if (!clean) return null;

  const parts = clean.startsWith('/')
    ? clean.slice(1).split('/')
    : [...(fromDir ? fromDir.split('/') : []), ...clean.split('/')];

  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/** Read an attribute value from an HTML tag without regex construction. */
function attr(tag: string, name: string): string | null {
  const lower = tag.toLowerCase();
  const target = name.toLowerCase();
  let index = lower.indexOf(target);

  while (index !== -1) {
    const before = index === 0 ? ' ' : lower.charAt(index - 1);
    if (/\s/.test(before)) {
      let cursor = index + target.length;
      while (cursor < tag.length && /\s/.test(tag.charAt(cursor))) cursor += 1;
      if (tag.charAt(cursor) === '=') {
        cursor += 1;
        while (cursor < tag.length && /\s/.test(tag.charAt(cursor))) cursor += 1;
        const quote = tag.charAt(cursor);
        if (quote === '"' || quote === "'") {
          const end = tag.indexOf(quote, cursor + 1);
          return end === -1 ? null : tag.slice(cursor + 1, end);
        }
        let end = cursor;
        while (end < tag.length && !/[\s>]/.test(tag.charAt(end))) end += 1;
        return tag.slice(cursor, end);
      }
    }
    index = lower.indexOf(target, index + 1);
  }

  return null;
}

function escapeScript(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}

function rewriteCssUrls(
  css: string,
  fromDir: string,
  blobFor: (path: string) => string | null,
): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote: string, ref: string) => {
    const path = resolveRef(fromDir, ref);
    if (!path) return match;
    const url = blobFor(path);
    return url ? 'url(' + quote + url + quote + ')' : match;
  });
}

/**
 * Best-effort module bundling: inline relative imports depth-first and strip
 * module syntax so the result runs as a classic script. Typical CodeFly
 * projects are classic scripts; this only covers simple module graphs.
 */
function bundleModule(
  files: Record<string, string>,
  path: string,
  seen: Set<string>,
  depth = 0,
): string {
  if (seen.has(path) || depth > 8) return '';
  seen.add(path);

  const source = files[path] ?? '';
  const chunks: string[] = [];

  const importPattern = /(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?(["'])([^"']+)\1\s*;?/g;
  const stripped = source.replace(importPattern, (match, _quote: string, ref: string) => {
    const dependency = resolveRef(dirOf(path), ref);
    if (dependency && Object.prototype.hasOwnProperty.call(files, dependency)) {
      chunks.push(bundleModule(files, dependency, seen, depth + 1));
      return '\n';
    }
    return match;
  });

  const cleaned = stripped
    .replace(/(?:^|\n)\s*export\s*\{[^}]*\}\s*;?/g, '\n')
    .replace(/(?:^|\n)\s*export\s*\*\s*from\s*["'][^"']+["']\s*;?/g, '\n')
    .replace(/(?:^|\n)\s*export\s+default\s+/g, '\n')
    .replace(/(?:^|\n)\s*export\s+(?:const|let|var|function|class|async)\s+/g, (match) =>
      match.replace('export ', ''),
    );

  return chunks.filter(Boolean).join('\n') + '\n' + cleaned;
}

const STORAGE_SHIM = [
  '<script>',
  '(function () {',
  '  function createStore() {',
  '    var data = {};',
  '    return {',
  '      getItem: function (key) {',
  '        return Object.prototype.hasOwnProperty.call(data, String(key)) ? data[String(key)] : null;',
  '      },',
  '      setItem: function (key, value) { data[String(key)] = String(value); },',
  '      removeItem: function (key) { delete data[String(key)]; },',
  '      clear: function () { data = {}; },',
  '      key: function (index) {',
  '        var keys = Object.keys(data);',
  '        return index < keys.length ? keys[index] : null;',
  '      },',
  '      get length() { return Object.keys(data).length; }',
  '    };',
  '  }',
  '  ["localStorage", "sessionStorage"].forEach(function (name) {',
  '    try {',
  '      window[name].setItem("__codefly_probe__", "1");',
  '      window[name].removeItem("__codefly_probe__");',
  '    } catch (error) {',
  '      try {',
  '        Object.defineProperty(window, name, { value: createStore(), configurable: true });',
  '      } catch (ignored) { /* nothing else we can do */ }',
  '    }',
  '  });',
  '})();',
  '</script>',
].join('\n');

export function buildPreview(files: Record<string, string>): PreviewDoc | null {
  const entry = files['index.html'];
  if (typeof entry !== 'string') return null;

  const urls: string[] = [];
  const blobFor = (path: string): string | null => {
    if (!Object.prototype.hasOwnProperty.call(files, path)) return null;
    const url = URL.createObjectURL(new Blob([files[path]], { type: mimeFor(path) }));
    urls.push(url);
    return url;
  };

  let html = entry;

  // Inline local stylesheets.
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const href = attr(tag, 'href');
    const path = href ? resolveRef('', href) : null;
    if (!path || !Object.prototype.hasOwnProperty.call(files, path)) return tag;
    const css = rewriteCssUrls(files[path], dirOf(path), blobFor);
    return '<style>\n' + css + '\n</style>';
  });

  // Inline local scripts (classic scripts directly, modules best-effort).
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs: string) => {
    const src = attr(attrs, 'src');
    if (!src) return tag;
    const path = resolveRef('', src);
    if (!path || !Object.prototype.hasOwnProperty.call(files, path)) return tag;
    const isModule = /\btype\s*=\s*["']?module/i.test(attrs);
    const code = isModule ? bundleModule(files, path, new Set()) : files[path];
    return '<script>\n' + escapeScript(code) + '\n</script>';
  });

  // Rewrite url() inside inline <style> blocks.
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (tag, css: string) => {
    return '<style>' + rewriteCssUrls(css, '', blobFor) + '</style>';
  });

  // Rewrite remaining local asset references (images, icons, fonts, links).
  html = html.replace(
    /(\s(?:src|href|poster)\s*=\s*)(["'])([^"']*)\2/gi,
    (match, prefix: string, quote: string, ref: string) => {
      const path = resolveRef('', ref);
      if (!path || !Object.prototype.hasOwnProperty.call(files, path) || path === 'index.html') {
        return match;
      }
      const url = blobFor(path);
      return url ? prefix + quote + url + quote : match;
    },
  );

  // Keep localStorage/sessionStorage working inside the sandboxed frame.
  if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b[^>]*>/i, (head) => head + '\n' + STORAGE_SHIM);
  } else if (/<html\b[^>]*>/i.test(html)) {
    html = html.replace(/<html\b[^>]*>/i, (tag) => tag + '\n' + STORAGE_SHIM);
  } else {
    html = STORAGE_SHIM + '\n' + html;
  }

  return { html, urls };
}
