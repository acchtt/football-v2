import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "./score-editor.css";
import "./readability-fix.css";

export const metadata: Metadata = {
  title: "SlipTrace Football Control",
  description: "Airtable-backed football schedule and picks history"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <div className="navin">
            <Link href="/schedule" className="brand">
              <div className="logo">ST</div>
              <div>
                <div className="brandname">SLIPTRACE</div>
                <div className="brandsub">FOOTBALL CONTROL</div>
              </div>
            </Link>
            <nav className="tabs">
              <Link href="/schedule">Schedule</Link>
              <Link href="/picks">Picks</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
