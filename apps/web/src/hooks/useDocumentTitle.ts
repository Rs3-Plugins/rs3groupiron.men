import { useEffect } from 'react';
import { SITE_NAME, SITE_URL } from '../lib/constants';

type SeoOptions = {
  /** Public path for the canonical link, e.g. '/login'. Omit for private pages. */
  canonicalPath?: string;
  /** Ask crawlers not to index this page (group views, demo). */
  noindex?: boolean;
};

function upsertLink(rel: string, href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertMeta(name: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Sets `document.title` to "<title> · RS3 Group Ironman" (or the site name),
 * plus a per-route canonical link and optional robots noindex.
 */
export function useDocumentTitle(title?: string | null, options: SeoOptions = {}) {
  const { canonicalPath, noindex } = options;
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  }, [title]);

  useEffect(() => {
    upsertLink('canonical', canonicalPath ? `${SITE_URL}${canonicalPath}` : null);
    upsertMeta('robots', noindex ? 'noindex,nofollow' : null);
    return () => {
      upsertLink('canonical', null);
      upsertMeta('robots', null);
    };
  }, [canonicalPath, noindex]);
}
