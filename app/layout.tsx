import type { Metadata, Viewport } from "next";
import { Baloo_2, Hind } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import "./globals.css";

const display = Baloo_2({ subsets: ["latin", "devanagari"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Hind({ subsets: ["latin", "devanagari"], weight: ["400", "500", "600"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Teen Seeti",
  description: "Put the phone on the counter and walk away. An open audio model counts the pressure cooker's whistles and tells you when to turn off the gas. It listens on the phone, offline.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#2b1d14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="top">
          <Link className="brand" href="/">
            <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
              <path d="M6 15h20v8a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z" fill="currentColor" />
              <rect x="4" y="13" width="24" height="3" rx="1.5" fill="currentColor" />
              <rect x="14.5" y="9" width="3" height="4" rx="1" fill="currentColor" />
              <path d="M16 7c-2-2 2-3 0-5M20 7c-2-2 2-3 0-5M12 7c-2-2 2-3 0-5" stroke="var(--accent)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
            Teen Seeti
          </Link>
        </header>
        {children}
        <footer className="foot">
          <p>
            Listens with YAMNet, an open audio model, running on your phone. Dishes it doesn&apos;t know are asked of GPT-OSS 20B, an open-weight model. After the first visit it works without internet.
          </p>
        </footer>
        <Script id="sw" strategy="afterInteractive">{`if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});`}</Script>
      </body>
    </html>
  );
}
