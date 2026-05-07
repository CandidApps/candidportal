import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candid Portal",
  description: "Candid Intelligence Platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

