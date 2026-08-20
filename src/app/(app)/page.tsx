import Link from "next/link";
import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/auth/authorization-catalog";
import { getUserAuthorization } from "@/auth/authorization";
import { getCurrentSession } from "@/auth/session";
import { PageHeader } from "@/components/app-shell/PageHeader";
import { db } from "@/lib/db";

export default async function OverviewPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  const authorization = await getUserAuthorization(session.user.id);
  const permissions = new Set(authorization.permissions);
  const canReadImports = permissions.has(PERMISSIONS.IMPORT_READ);
  const canReadRegions = permissions.has(PERMISSIONS.CALENDAR_REGION_READ);
  const canReadNotifications = permissions.has(
    PERMISSIONS.NOTIFICATION_PLAN_READ,
  );

  if (authorization.roles.length === 0) {
    return (
      <div className="page-stack">
        <PageHeader
          description="Authentication succeeded. Application access is assigned independently inside ATI PH."
          eyebrow="Overview"
          title="ATI PH access is not assigned yet"
        />
        <section className="ati-card empty-access-card">
          <h2>Authenticated identity, no application role</h2>
          <p>
            Your local user projection exists, but there is no active ATI PH
            role assignment yet. An administrator must assign an application
            role before operational menus become available.
          </p>
        </section>
      </div>
    );
  }

  const [
    totalImports,
    validatedImports,
    invalidImports,
    activeRegions,
    dueNotifications,
    failedNotifications,
    openNotificationAlerts,
    unknownDeliveryOutcomes,
  ] = await Promise.all([
    canReadImports
      ? db.importBatch.count()
      : Promise.resolve(0),
    canReadImports
      ? db.importBatch.count({
          where: { status: "VALIDATED" },
        })
      : Promise.resolve(0),
    canReadImports
      ? db.importBatch.count({
          where: { status: "INVALID" },
        })
      : Promise.resolve(0),
    canReadRegions
      ? db.calendarRegion.count({
          where: { isActive: true },
        })
      : Promise.resolve(0),
    canReadNotifications
      ? db.notificationJob.count({
          where: { status: "DUE" },
        })
      : Promise.resolve(0),
    canReadNotifications
      ? db.notificationJob.count({
          where: { status: "FAILED" },
        })
      : Promise.resolve(0),
    canReadNotifications
      ? db.notificationOperationalAlert.count({
          where: { status: "OPEN" },
        })
      : Promise.resolve(0),
    canReadNotifications
      ? db.notificationDeliveryAttempt.count({
          where: {
            status: "FAILED",
            failureClass:
              "OUTCOME_UNKNOWN",
            reconciliationAction: null,
            notificationJob: {
              status: "FAILED",
            },
          },
        })
      : Promise.resolve(0),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        description="Live operational state from ATI PH. No notification or holiday totals are mocked on this page."
        eyebrow="Overview"
        title="Public Holiday operations"
      />

      <section className="overview-grid" aria-label="Operational summary">
        <MetricCard label="Imports" value={totalImports} />
        <MetricCard label="Validated" value={validatedImports} />
        <MetricCard label="Invalid" value={invalidImports} />
        <MetricCard label="Active regions" value={activeRegions} />
        {canReadNotifications ? (
          <>
            <MetricCard
              label="Notifications due"
              value={dueNotifications}
            />
            <MetricCard
              label="Delivery failed"
              value={failedNotifications}
            />
            <MetricCard
              label="Open alerts"
              value={openNotificationAlerts}
            />
            <MetricCard
              label="Unknown outcomes"
              value={unknownDeliveryOutcomes}
            />
          </>
        ) : null}
      </section>

      <section className="ati-card workspace-links">
        <div>
          <p className="eyebrow">Available now</p>
          <h2>Operational workspaces</h2>
          <p>
            Navigation is generated from the database menu catalog and filtered
            by your current application permissions.
          </p>
        </div>

        <div className="workspace-link-grid">
          {canReadImports ? (
            <Link className="workspace-link" href="/imports">
              <strong>Governed imports</strong>
              <span>Upload, validate and review source workbooks</span>
            </Link>
          ) : null}

          {canReadRegions ? (
            <Link className="workspace-link" href="/admin/calendar-regions">
              <strong>Calendar regions</strong>
              <span>View governed regions and approved source aliases</span>
            </Link>
          ) : null}

          {canReadNotifications ? (
            <Link
              className="workspace-link"
              href="/notification-planning"
            >
              <strong>
                Notification operations
              </strong>
              <span>
                Planning, exception queues, delivery reconciliation,
                automation health and audit
              </span>
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="ati-card overview-metric">
      <span>{label}</span>
      <strong>{value.toLocaleString("en-US")}</strong>
    </article>
  );
}
