import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aula F75 Max no CachyOS — Guia Definitivo",
  description:
    "Instale o driver nativo do Epomaker x Aula F75 Max no CachyOS/Arch Linux: comandos copiáveis, config perfeita de RGB, bateria e Game Mode, ideias de GIFs para o display 128×128 e troubleshooting.",
  keywords: [
    "Aula F75 Max",
    "CachyOS",
    "Arch Linux",
    "Epomaker",
    "teclado mecânico",
    "driver Linux",
    "hidapi",
  ],
  authors: [{ name: "Z.ai" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
