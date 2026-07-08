import type { Metadata } from "next";
import { Archivo, Cormorant } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Future of Public Health — Foresight Workshop",
  description:
    "An interactive foresight model and live workshop tool for NNPHI's Future of Public Health work, framed to ~2035.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${cormorant.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
