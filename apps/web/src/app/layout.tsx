import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anchorline — Brokerage Ops",
  description: "Performance dashboard blending RingCentral call activity with AgencyZoom pipeline data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
