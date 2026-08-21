"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { mountedPath } from "@/config/app";

type NavigationItem = {
  code: string;
  label: string;
  path: string | null;
  sortOrder: number;
  parentCode: string | null;
};

export function AppShell({
  children,
  menus,
}: {
  children: ReactNode;
  menus: NavigationItem[];
}) {
  const pathname = usePathname();
  const navigationItems = orderedNavigationItems(menus);

  return (
    <div className="embedded-app-shell">
      {navigationItems.length > 1 ? (
        <nav
          className="app-local-navigation"
          aria-label="PH Notification navigation"
        >
          <div className="app-local-navigation__inner">
            {navigationItems.map((item) => (
              <NavigationLink
                item={item}
                key={item.code}
                pathname={pathname}
              />
            ))}
          </div>
        </nav>
      ) : null}

      <main className="app-content">{children}</main>
    </div>
  );
}

function orderedNavigationItems(
  menus: NavigationItem[],
): NavigationItem[] {
  const roots = menus
    .filter((menu) => menu.parentCode === null)
    .sort(compareMenu);

  return roots.flatMap((root) => {
    const own = root.path ? [root] : [];
    const children = menus
      .filter(
        (menu) =>
          menu.parentCode === root.code &&
          menu.path !== null,
      )
      .sort(compareMenu);

    return [...own, ...children];
  });
}

function compareMenu(
  left: NavigationItem,
  right: NavigationItem,
): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.label.localeCompare(right.label)
  );
}

function NavigationLink({
  item,
  pathname,
}: {
  item: NavigationItem;
  pathname: string;
}) {
  if (!item.path) {
    return null;
  }

  const active = isActivePath(pathname, item.path);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "app-local-nav-link app-local-nav-link--active"
          : "app-local-nav-link"
      }
      href={item.path}
      /*
       * Prefetch off, because its prefetch never settles.
       *
       * Next asks for a route's RSC payload with an `_rsc` cache key derived from the
       * request's routing headers. For two of these links the value the client sends is
       * not the value the server computes, so the server answers 307 to the corrected
       * URL, the client re-issues the original, and the pair repeats for as long as the
       * page is open — measured at roughly forty requests a second against
       * `/admin/client-routing` and `/admin/notification-policies`.
       *
       * Reproduced against ATI PH directly, with a valid session and no portal in the
       * path, so it is neither the proxy nor rule 8. What it is, exactly, is Next's own
       * prefetch negotiation, and nothing in this repository decides it.
       *
       * What this costs is a warmed cache on hover. Seven tabs, every page dynamic
       * behind `connection()` in the layout, and an operator who reads far more than
       * they click — so the saving was small and the loop was not. Actual navigation is
       * untouched: it never used the prefetch, which is why the screens worked
       * throughout.
       *
       * Remove this when a Next upgrade settles the negotiation, and confirm by
       * watching the portal's `[internal-app]` log for a repeating 307/200 pair on one
       * path. The log prints the query string, which is what makes the repeat visible.
       */
      prefetch={false}
    >
      {item.label}
    </Link>
  );
}

function isActivePath(
  pathname: string,
  itemPath: string,
): boolean {
  const mounted = mountedPath(itemPath);

  if (itemPath === "/") {
    return pathname === "/" || pathname === mounted;
  }

  return (
    pathname === itemPath ||
    pathname.startsWith(`${itemPath}/`) ||
    pathname === mounted ||
    pathname.startsWith(`${mounted}/`)
  );
}
