"use client";

import { useEffect, useState } from "react";

import { JobEvidence, type Job } from "@/components/ph-dashboard/JobEvidence";
import { mountedPath } from "@/config/app";

type JobsResponse = { jobs: Job[]; error?: string };

/**
 * What one occurrence's committed plan became.
 *
 * The rows and their evidence are `JobEvidence`, shared with the cross-occurrence
 * delivery list — the same facts shown two ways would be worse on an audit screen than
 * showing fewer.
 */
export function CommittedJobs({
  occurrenceId,
}: {
  occurrenceId: string;
}) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string>();
  const [openJobId, setOpenJobId] = useState<string>();
  const [detail, setDetail] = useState<Job>();
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          mountedPath(
            `/api/notification-planning/jobs/${occurrenceId}`,
          ),
          { cache: "no-store" },
        );
        const payload = (await response.json()) as JobsResponse;
        if (!response.ok) {
          throw new Error(
            payload.error ?? "Could not load committed jobs.",
          );
        }
        if (!cancelled) setJobs(payload.jobs);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load committed jobs.",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [occurrenceId]);

  /*
   * The body is fetched per job, not with the list.
   *
   * One occurrence has a job per matching subscription, and each frozen body is a whole
   * email. Sending all of them to render a column of subjects would be megabytes for a
   * table nobody has expanded yet.
   */
  async function openJob(jobId: string) {
    if (openJobId === jobId) {
      setOpenJobId(undefined);
      setDetail(undefined);
      return;
    }

    setOpenJobId(jobId);
    setDetail(undefined);
    setDetailBusy(true);

    try {
      const response = await fetch(
        mountedPath(
          `/api/notification-planning/jobs/${occurrenceId}?jobId=${encodeURIComponent(jobId)}`,
        ),
        { cache: "no-store" },
      );
      const payload = (await response.json()) as JobsResponse;
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not load the delivered email.",
        );
      }
      setDetail(payload.jobs[0]);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : "Could not load the delivered email.",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  if (error) {
    return (
      <div className="committed-jobs">
        <p className="form-notice form-notice--error">{error}</p>
      </div>
    );
  }

  if (!jobs) {
    return (
      <div className="committed-jobs">
        <p className="committed-jobs__empty">Loading committed jobs…</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="committed-jobs">
        <p className="committed-jobs__empty">
          Nothing committed yet. Committing the plan above freezes one durable job per
          matched subscription.
        </p>
      </div>
    );
  }

  return (
    <div className="committed-jobs">
      <div className="committed-jobs__header">
        <strong>Committed jobs</strong>
        <span>
          One job is one subscription, and one email. What the provider answered is
          recorded per attempt.
        </span>
      </div>

      {jobs.map((job) => (
        <JobEvidence
          busy={detailBusy}
          detail={detail}
          job={job}
          key={job.id}
          onToggle={() => void openJob(job.id)}
          open={openJobId === job.id}
        />
      ))}
    </div>
  );
}
