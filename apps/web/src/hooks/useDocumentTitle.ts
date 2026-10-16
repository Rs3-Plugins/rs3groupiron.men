import { useEffect } from 'react';
import { SITE_NAME, SITE_URL } from '../lib/constants';

type SeoOptions = {
  /** Public path for the canonical link and og:url, e.g. '/login'. */
  canonicalPath?: string;
  /** Overrides the site description for this route. */
  description?: string;
  /** Ask crawlers not to index this page (group views, demo). */
  noindex?: boolean;
};

function metaEl(attr: 'name' | 'property', key: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  return el;
}

/**
 * The values index.html shipped with, captured before React touches anything.
 * A route that overrides them restores these on the way out, so going back to
 * the landing page doesn't leave another page's description behind — a single
 * page app has no reload to reset the head for it.
 */
const DEFAULTS = {
  title: document.title,
  description: metaEl('name', 'description').content,
  robots: metaEl('name', 'robots').content || 'index, follow',
  ogTitle: metaEl('property', 'og:title').content,
  ogDescription: metaEl('property', 'og:description').content,
  ogUrl: metaEl('property', 'og:url').content,
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

/**
 * Sets `document.title` to "<title> · RS3 Group Ironman", plus the per-route
 * description, canonical link, og:title/description/url and optional noindex.
 */
export function useDocumentTitle(title?: string | null, options: SeoOptions = {}) {
  const { canonicalPath, description, noindex } = options;

  useEffect(() => {
    const full = title ? `${title} · ${SITE_NAME}` : DEFAULTS.title;
    document.title = full;
    metaEl('property', 'og:title').content = title ? full : DEFAULTS.ogTitle;
    return () => {
      document.title = DEFAULTS.title;
      metaEl('property', 'og:title').content = DEFAULTS.ogTitle;
    };
  }, [title]);

  useEffect(() => {
    if (!description) return;
    metaEl('name', 'description').content = description;
    metaEl('property', 'og:description').content = description;
    return () => {
      metaEl('name', 'description').content = DEFAULTS.description;
      metaEl('property', 'og:description').content = DEFAULTS.ogDescription;
    };
  }, [description]);

  useEffect(() => {
    const url = canonicalPath ? `${SITE_URL}${canonicalPath}` : null;
    upsertLink('canonical', url);
    // A noindex page keeps the site's own og:url rather than advertising a
    // private path to anything that scrapes a shared link.
    metaEl('property', 'og:url').content = url ?? DEFAULTS.ogUrl;
    metaEl('name', 'robots').content = noindex ? 'noindex, nofollow' : DEFAULTS.robots;
    return () => {
      upsertLink('canonical', null);
      metaEl('property', 'og:url').content = DEFAULTS.ogUrl;
      metaEl('name', 'robots').content = DEFAULTS.robots;
    };
  }, [canonicalPath, noindex]);
}
