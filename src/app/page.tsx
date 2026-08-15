import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentSession } from "@/auth/session";
import { PhDashboard } from "@/components/ph-dashboard/PhDashboard";
import { getServerEnv } from "@/lib/env";

export default async function Home() {
  await connection();
  const session = await getCurrentSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  const skillUrl = new URL(
    "/skills/japanese-translation",
    getServerEnv().ATI_ONE_RETURN_URL,
  ).toString();

  return (
    <PhDashboard
      userName={session.user.displayName ?? session.user.email}
      role={session.user.role}
      skillUrl={skillUrl}
    />
  );
}
