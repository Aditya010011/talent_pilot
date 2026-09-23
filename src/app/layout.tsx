import { URL as NativeURL } from "node:url";

try {
  Object.defineProperty(global, "URL", {
    value: NativeURL,
    writable: false,
    configurable: false,
  });
} catch (e) {}

try {
  Object.defineProperty(globalThis, "URL", {
    value: NativeURL,
    writable: false,
    configurable: false,
  });
} catch (e) {}

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/toaster";
import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inluwa-ai.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Inluwa AI - AI Interview Platform | Voice & Video Interviews",
    template: "%s | Inluwa AI",
  },
  description:
    "Inluwa AI is the AI interview platform for structured voice, chat, and video interviews. Automate candidate screening, get real-time insights, and scale your interview process.",
  keywords: [
    "AI interview platform",
    "voice interview",
    "AI interviews",
    "interview platform",
    "structured interviews",
    "voice interviews",
    "video interviews",
    "AI voice interview",
    "automated interviews",
    "interview automation",
    "candidate assessment",
    "interview analytics",
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Inluwa AI",
    title: "Inluwa AI - AI Interview Platform | Voice & Video Interviews",
    description:
      "Inluwa AI is the AI interview platform for structured voice, chat, and video interviews. Automate candidate screening, get real-time insights, and scale your interview process.",
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/images/marketing/hero-screenshots.webp`,
        width: 1920,
        height: 960,
        alt: "Inluwa AI AI Interview Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inluwa AI - AI Interview Platform | Voice & Video Interviews",
    description:
      "Inluwa AI is the AI interview platform for structured voice, chat, and video interviews. Automate candidate screening, get real-time insights, and scale your interview process.",
    images: [`${siteUrl}/images/marketing/hero-screenshots.webp`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
