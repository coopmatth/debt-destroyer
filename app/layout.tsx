import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Debt Destroyer",
  description:
    "Sync your accounts, read your real cash flow, and strike your highest-APR debt every week.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
