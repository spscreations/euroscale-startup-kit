import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EuroScale — Dashboard",
  description:
    "EuroScale customer dashboard — manage your cloud infrastructure, monitor usage, and scale effortlessly.",
  keywords: ["EuroScale", "cloud", "dashboard", "infrastructure", "scale-up"],
  authors: [{ name: "EuroScale" }],
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-navy-900 text-text-primary font-inter antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
