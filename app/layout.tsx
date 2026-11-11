import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Metadata, Viewport } from "next";
import SmoothScroll from "@/components/SmoothScroll";
import PageTransition from "@/components/PageTransition";
import { ToastProvider } from "@/components/Toasts";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#FFB81C" };

export const metadata: Metadata = {
  appleWebApp: { capable: true, title: "NexKido", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-192.png" },
  title: "NexKido — where's the school bus?",
  description: "Live GPS tracking, ETA and arrival alerts for school transport. Driver, parent and admin portals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Instrument+Sans:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <SmoothScroll>
          <PageTransition />
          <ToastProvider>{children}</ToastProvider>
        </SmoothScroll>
      </body>
    </html>
  );
}
