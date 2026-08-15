import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { listAuthorizedMenus } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { AppShell } from "@/components/app-shell/AppShell";

export default async function ApplicationLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();

  const session = await getCurrentSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  const menus = await listAuthorizedMenus(session.user.id);

  return <AppShell menus={menus}>{children}</AppShell>;
}
