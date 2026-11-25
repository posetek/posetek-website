import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import WorkspacePreview from './workspace';

export function mountActivityFixture() {
  // Keep the interactive review inside the synthetic site, including target=_blank links.
  const blockExternalLink = event => {
    const link = event.target instanceof Element && event.target.closest('a[href]');
    if (link && new URL(link.href, location.href).origin !== location.origin) event.preventDefault();
  };
  document.addEventListener('click', blockExternalLink, true);
  document.addEventListener('auxclick', blockExternalLink, true);
  const root = document.createElement('div');
  document.body.append(root);
  createRoot(root).render(createElement(BrowserRouter, null, createElement(WorkspacePreview)));
}
