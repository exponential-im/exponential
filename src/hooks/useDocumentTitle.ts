'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { sectionTitleForPath } from '~/lib/pageTitle';

/**
 * Browser-tab titles. DocumentTitleProvider (mounted once, in the signed-in
 * shell) is the only thing that writes `document.title`: it shows the newest
 * name a mounted component registered through useDocumentTitle, else the
 * section the URL is in ("Projects", "Pages"). Titles carry no product-name
 * suffix — the favicon already says which app the tab is.
 *
 * One owner, rather than each page setting the title in an effect, because a
 * layout's effect runs after its children's and would overwrite a page's name.
 */

interface TitleEntry {
  ownerId: string;
  title: string;
}

interface TitleRegistry {
  register: (ownerId: string, title: string) => void;
  unregister: (ownerId: string) => void;
}

const DocumentTitleContext = createContext<TitleRegistry | null>(null);

export function DocumentTitleProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [entries, setEntries] = useState<TitleEntry[]>([]);

  const register = useCallback((ownerId: string, title: string) => {
    setEntries((prev) => [...prev.filter((e) => e.ownerId !== ownerId), { ownerId, title }]);
  }, []);
  // Removes only its own entry, so a page unmounting after the next one
  // registered can't wipe the newcomer's name.
  const unregister = useCallback((ownerId: string) => {
    setEntries((prev) => prev.filter((e) => e.ownerId !== ownerId));
  }, []);
  const registry = useMemo(() => ({ register, unregister }), [register, unregister]);

  const title = entries.at(-1)?.title ?? sectionTitleForPath(pathname ?? '');

  // Null on routes whose page sets a Next metadata title: leave that one be.
  // Next streams the layout's metadata <title> in after hydration, which
  // would overwrite this one, so put ours back whenever the head's title moves.
  useEffect(() => {
    if (!title) return;
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);

  return createElement(DocumentTitleContext.Provider, { value: registry }, children);
}

/**
 * Names the browser tab while this component is mounted — use it on a detail
 * page with the entity's name ("Engineering management"). Pass null while
 * there is nothing to name yet; the tab shows the section until then.
 *
 * Keep names free of " | ": RecentsNav reads the part before it as a name.
 */
export function useDocumentTitle(title: string | null | undefined) {
  const registry = useContext(DocumentTitleContext);
  const ownerId = useId();
  const trimmed = title?.trim() ?? '';

  useEffect(() => {
    if (!trimmed) return;
    if (registry) {
      registry.register(ownerId, trimmed);
      return () => registry.unregister(ownerId);
    }
    // No provider (tests, pages outside the signed-in shell): set it directly.
    const previous = document.title;
    document.title = trimmed;
    return () => {
      document.title = previous;
    };
  }, [registry, ownerId, trimmed]);
}
