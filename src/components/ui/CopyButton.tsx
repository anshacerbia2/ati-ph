"use client";

import { useEffect, useRef, useState } from "react";

type CopyState = "IDLE" | "COPIED" | "FAILED";

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [state, setState] = useState<CopyState>("IDLE");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard API is unavailable.");
      }

      await navigator.clipboard.writeText(value);
      setState("COPIED");
    } catch {
      setState("FAILED");
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setState("IDLE");
      timerRef.current = null;
    }, 1600);
  }

  return (
    <button
      aria-label={`${label}: ${value}`}
      className="ati-btn ati-btn--compact ati-btn--neutral-subtle copy-button"
      onClick={() => void copy()}
      type="button"
    >
      {state === "COPIED"
        ? "Copied"
        : state === "FAILED"
          ? "Copy failed"
          : label}
    </button>
  );
}
