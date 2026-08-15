type IconName = "calendar-check" | "timer" | "envelope" | "sparkle" | "arrow";

export function AtiIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "calendar-check") {
    return (
      <svg {...common}>
        <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        <path d="m8.5 14 2 2 4.5-4.5" />
      </svg>
    );
  }

  if (name === "timer") {
    return (
      <svg {...common}>
        <circle cx="12" cy="13" r="8" />
        <path d="M9 2h6M12 13l3-3" />
      </svg>
    );
  }

  if (name === "envelope") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }

  if (name === "sparkle") {
    return (
      <svg {...common}>
        <path d="M12 2c.6 4.7 2.7 6.8 7.5 7.5-4.8.7-6.9 2.8-7.5 7.5-.7-4.7-2.8-6.8-7.5-7.5C9.2 8.8 11.3 6.7 12 2Z" />
        <path d="M19 15c.2 1.7 1 2.5 2.7 2.7-1.7.3-2.5 1-2.7 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.2 2.5-1 2.8-2.7Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}
