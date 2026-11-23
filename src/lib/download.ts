import JSZip from 'jszip';

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'codefly-project';
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export async function downloadProjectZip(name: string, files: Record<string, string>): Promise<void> {
  const zip = new JSZip();
  const paths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  if (paths.length === 0) {
    zip.file('README.txt', 'This CodeFly project is empty. Ask the agent to build something first.');
  }
  for (const path of paths) zip.file(path, files[path]);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownload(blob, slugify(name) + '.zip');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
