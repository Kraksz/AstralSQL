import type { Metadata } from "next";
import "./globals.css";
import "./identity.css";
import "@/components/help/connection-guide.css";
export const metadata: Metadata = {
  title: "Astral SQL — Your data. A clearer universe.",
  description:
    "Local-first SQL for power users. A Rust-powered desktop database client with direct PostgreSQL, MySQL, MariaDB, and SQLite connections.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}

