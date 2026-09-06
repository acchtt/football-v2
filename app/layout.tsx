import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football v2 — Reset",
  description: "The previous Football v2 website has been retired."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
