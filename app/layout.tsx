import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cf-git - Git Repos, Federated",
  description: "Git repository manager for the fediverse. Host, clone, and federate Git repositories via ActivityPub.",
  openGraph: {
    title: "cf-git",
    description: "Git repositories, federated.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
