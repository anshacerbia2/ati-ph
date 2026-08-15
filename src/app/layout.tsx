import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { fontVariables } from "./fonts";

export const metadata: Metadata = {
  title: "PH Notification",
  description: "Public holiday notification operations",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={fontVariables}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
