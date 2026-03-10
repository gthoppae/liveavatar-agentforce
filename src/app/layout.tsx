import type { Metadata } from "next";
import { Geist, Geist_Mono, Ubuntu, Zilla_Slab } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DebugProvider } from "@/context/DebugContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ubuntu = Ubuntu({
  variable: "--font-ubuntu",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const zillaSlab = Zilla_Slab({
  variable: "--font-zilla-slab",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LiveAvatar + Agentforce Demo",
  description: "Voice-enabled AI avatar powered by HeyGen LiveAvatar and Salesforce Agentforce",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ubuntu.variable} ${zillaSlab.variable} antialiased`}
      >
        <ThemeProvider>
          <DebugProvider>{children}</DebugProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
