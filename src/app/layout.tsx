import type { Metadata } from "next";
import { Suspense } from "react";
import { GlobalLoadingProvider } from "@/components/loading/global-loading-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matt Work Tracker",
  description: "Track employee work, manage projects, and generate reports",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased">
        <ThemeProvider>
          <Suspense fallback={<>{children}</>}>
            <GlobalLoadingProvider>{children}</GlobalLoadingProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
