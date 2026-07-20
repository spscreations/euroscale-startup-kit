import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Providers } from "@/providers";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EuroScale — Dashboard",
  description:
    "EuroScale customer dashboard — manage your cloud infrastructure, monitor usage, and scale effortlessly.",
  keywords: ["EuroScale", "cloud", "dashboard", "infrastructure", "scale-up"],
  authors: [{ name: "EuroScale" }],
  robots: "noindex, nofollow",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg-primary text-text-primary font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
