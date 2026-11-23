import type { Project } from '../types';

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'codefly-project'
  );
}

/** Download every project file as a ZIP, ready to open with index.html. */
export async function downloadProjectZip(project: Project): Promise<void> {
  // Loaded on demand so the ZIP library stays out of the initial bundle.
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [path, content] of Object.entries(project.files)) {
    zip.file(path, content);
  }
  zip.file(
    'README.txt',
    'Project: ' + project.name + '\nGenerated with CodeFly AI.\nOpen index.html in a browser to run it.\n',
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = slug(project.name) + '.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
