import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BrandingProvider } from "@/components/branding/BrandingProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dark Pay — Payment Solutions",
  description: "Painel de controle Dark Pay",
  icons: {
    icon: "/logo-darkpay-clean.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          <BrandingProvider>{children}</BrandingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
