import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "PermitPilot Truth Engine",
  description: "Dynamic EHS research graph MVP"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
