import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Overland Planner",
  description: "Plan overlanding trips with routes, campsites, fuel, attractions and budget in one place.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
