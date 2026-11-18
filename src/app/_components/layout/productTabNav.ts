import { PRODUCT_TABS } from '~/app/_components/product/productTabs';

// Overview is left out: searching a product's name already lists the product.
const NAV_TABS = PRODUCT_TABS.filter((t) => t.href !== '');

// A query like "c" would otherwise list a few tabs for every product.
export const PRODUCT_NAV_LIMIT = 8;

export type ProductTabNavRow = {
  key: string;
  label: string;
  href: string;
  icon: (typeof PRODUCT_TABS)[number]['icon'];
};

/**
 * The product tabs ("CLEAR - Cycles") the Cmd+K palette offers for a query.
 *
 * A tab matches when one word of the query starts one of the tab's words
 * ("cyc" → Cycles, "tickets" → Backlog) and every word appears in the product
 * name or the tab, so "clear cycles" narrows to one product. The product name
 * alone lists no tabs: the product's own search result already covers it.
 */
export function matchProductTabs(
  query: string,
  products: { id: string; name: string; slug: string }[],
  workspaceSlug: string,
): ProductTabNavRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const rows: ProductTabNavRow[] = [];
  for (const product of products) {
    for (const tab of NAV_TABS) {
      const tabTerms = [tab.label, ...tab.keywords].map((t) => t.toLowerCase());
      const haystack = `${product.name} ${tabTerms.join(' ')}`.toLowerCase();
      const hitsTab = words.some((w) => tabTerms.some((t) => t.startsWith(w)));
      if (!hitsTab || !words.every((w) => haystack.includes(w))) continue;
      rows.push({
        key: `product-nav-${product.id}-${tab.value}`,
        label: `${product.name} - ${tab.label}`,
        href: `/w/${workspaceSlug}/products/${product.slug}${tab.href}`,
        icon: tab.icon,
      });
    }
  }
  return rows.slice(0, PRODUCT_NAV_LIMIT);
}
