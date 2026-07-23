import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BrandingProvider } from "@/components/branding/BrandingProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dark Pay Payment Solutions",
  description: "Painel de controle Dark Pay",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/Fiveicon-notif.png", sizes: "192x192", type: "image/png" },
      { url: "/Fiveicon.png", type: "image/png" },
    ],
    apple: [
      { url: "/Fiveicon-notif.png", sizes: "192x192", type: "image/png" },
      { url: "/Fiveicon.png", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Dark Pay",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
  themeColor: "#0c0e12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <QueryProvider>
          <AuthProvider>
            <BrandingProvider>{children}</BrandingProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
