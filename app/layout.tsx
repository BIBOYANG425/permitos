import type { ReactNode } from "react";

export const metadata = {
  title: "PermitPilot",
  description: "Dynamic EHS research graph MVP"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
