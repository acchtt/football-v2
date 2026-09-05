import type { Metadata } from "next";
import "./globals.css";
import "./logo-enhancements.css";

export const metadata: Metadata = {
  title: "Football Decision Control",
  description: "Chat-published football PRE decisions with BSD XI and odds execution"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
