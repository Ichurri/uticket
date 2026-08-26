import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { VerifyEmailBanner } from "@/components/layout/VerifyEmailBanner";
import { RefreshOnFocus } from "@/components/layout/RefreshOnFocus";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import { Toaster } from "@/components/ui/Toast";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Compra boletos digitales para shows de comedia, conciertos y más. Paga con QR y recibe tu entrada al instante. Rápido, seguro y simple.";

export const metadata: Metadata = {
  // Without metadataBase every og:image resolves relative and breaks in the
  // one place that matters here: the WhatsApp link preview.
  metadataBase: SITE_URL,
  title: {
    default: "Üticket — Tu entrada en un clic",
    template: "%s | Üticket",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Üticket",
    locale: "es_BO",
    title: "Üticket — Tu entrada en un clic",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Üticket — Tu entrada en un clic",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen flex-col font-sans">
        <ThemeProvider>
          <RefreshOnFocus />
          <OfflineBanner />
          <Navbar />
          <VerifyEmailBanner />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
