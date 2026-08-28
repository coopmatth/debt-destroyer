import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Debt Destroyer",
  description: "Live Cashflow & Automated Debt Avalanche Engine",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Debt Destroyer",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-page text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
