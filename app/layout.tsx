import type { Metadata } from "next";
import PickAutoRecorder from "@/components/PickAutoRecorder";
import "./globals.css";
import "./logo-enhancements.css";
import "./odds-input.css";

export const metadata: Metadata = {
  title: "Football Decision Control",
  description: "Chat-published football PRE decisions with BSD XI, odds execution, and an immutable picks ledger"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PickAutoRecorder />{children}</body></html>;
}
