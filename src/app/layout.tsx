import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candid Intelligence Platform",
  description:
    "Cost optimization and technology management platform by Candid Solutions",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Candid",
  },
  icons: {
    icon: "/brand/candid-pwa-192.png",
    apple: "/brand/candid-pwa-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c8281e" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e18" },
  ],
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('candid-theme');var d=t==='dark';document.documentElement.setAttribute('data-theme',d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
