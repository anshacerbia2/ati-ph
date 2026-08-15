import { mountedPath } from "@/config/app";
import { AtiIcon } from "@/components/ph-dashboard/AtiIcon";
import { CalendarRegionAdmin } from "@/components/ph-dashboard/CalendarRegionAdmin";
import { dashboardStats } from "@/components/ph-dashboard/data";
import { HolidayTable } from "@/components/ph-dashboard/HolidayTable";
import { ImportWorkspace } from "@/components/ph-dashboard/ImportWorkspace";

const highlights = [
  {
    icon: "calendar-check" as const,
    title: "Gazetted calendar",
    body: "All 17 Indonesian national holidays and cuti bersama dates for 2026, kept current by the CX team.",
  },
  {
    icon: "timer" as const,
    title: "30 days’ notice",
    body: "Every subscribed client is emailed exactly 30 days before each holiday so they can arrange cover.",
  },
  {
    icon: "envelope" as const,
    title: "Delivery tracked",
    body: "Sends, opens and bounces are logged per client; bounces retry automatically and surface in Activity.",
  },
];

export function PhDashboard({
  userName,
  roles,
  permissions,
  skillUrl,
}: {
  userName: string;
  roles: string[];
  permissions: string[];
  skillUrl: string;
}) {
  const permissionSet = new Set(permissions);
  const canUpload = permissionSet.has("import.create");
  const canManageRegions = permissionSet.has("calendar_region.manage");
  const roleLabel =
    roles.length > 0
      ? roles.map((role) => role.toLowerCase()).join(", ")
      : "no application role";

  return (
    <main className="dashboard-shell">
      <div className="dashboard-toolbar">
        <div>
          <span className="live-dot" aria-hidden="true" />
          <span>Public Holiday operations</span>
        </div>
        <div className="session-actions">
          <span className="session-user">{userName} · {roleLabel}</span>
          <form action={mountedPath("/api/auth/logout")} method="post">
            <button className="toolbar-link" type="submit">End session</button>
          </form>
        </div>
      </div>

      <section className="ati-card how-card" aria-labelledby="how-heading">
        <p className="eyebrow">How it works</p>
        <h1 id="how-heading">Clients hear about every Indonesian public holiday 30 days early</h1>
        <div className="highlight-grid">
          {highlights.map((highlight) => (
            <article className="highlight-item" key={highlight.title}>
              <span className="icon-tile">
                <AtiIcon name={highlight.icon} />
              </span>
              <h2>{highlight.title}</h2>
              <p>{highlight.body}</p>
            </article>
          ))}
        </div>
      </section>

      <ImportWorkspace canUpload={canUpload} />

      {canManageRegions ? <CalendarRegionAdmin /> : null}

      <section className="stat-grid" aria-label="Notification summary">
        {dashboardStats.map((stat) => (
          <article className="ati-card stat-card" key={stat.label}>
            <p className="micro-label">{stat.label}</p>
            <strong>{stat.value}</strong>
            <span className={stat.tone ? "delta-" + stat.tone : ""}>{stat.delta}</span>
          </article>
        ))}
      </section>

      <HolidayTable />

      <aside className="nudge-card">
        <span className="nudge-icon"><AtiIcon name="sparkle" size={22} /></span>
        <div>
          <p className="eyebrow">Recommended skill</p>
          <h2>Send the Christmas notice in Japanese too</h2>
          <p>
            Japanese Translation can localise the holiday-cover notice for your
            JA-language accounts before the 25 Nov send.
          </p>
        </div>
        <a className="ati-btn ati-btn--secondary" href={skillUrl} target="_top">
          Open skill <AtiIcon name="arrow" size={16} />
        </a>
      </aside>
    </main>
  );
}
