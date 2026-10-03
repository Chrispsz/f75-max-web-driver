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
  title: "F75 Max Web Driver",
  description:
    "Driver completo do Epomaker x Aula F75 Max direto no navegador: iluminação, desempenho, display 128×128, bateria e console de pacotes com hexdumps — 100% local via WebHID.",
  keywords: [
    "Aula F75 Max",
    "Epomaker",
    "WebHID",
    "driver web",
    "teclado mecânico",
    "RGB",
    "Linux",
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
