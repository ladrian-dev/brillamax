import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { GlobalSync } from "@/components/brillamax/GlobalSync";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brillamax",
  description:
    "Gestión integral para microfábrica de productos de limpieza: inventario, recetas, producción, ventas y cuentas por cobrar. Dual-currency USD/VEF, offline-first.",
  applicationName: "Brillamax",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Brillamax",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#c75146",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Leer tenantId del JWT para arrancar el sync outbox globalmente. El proxy
  // ya garantiza que rutas autenticadas solo se alcanzan con sesión válida;
  // aquí tolera null para rutas públicas (/auth/*, /onboarding).
  let tenantId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    tenantId = (data.user?.app_metadata?.tenant_id as string | undefined) ?? null;
  } catch {
    tenantId = null;
  }

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GlobalSync tenantId={tenantId} />
        {children}
      </body>
    </html>
  );
}
