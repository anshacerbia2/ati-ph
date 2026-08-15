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
