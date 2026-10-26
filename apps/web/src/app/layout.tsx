import type { Metadata, Viewport } from "next";
import { InstallApp } from "@/components/InstallApp";
import { THEME_SCRIPT } from "@/components/ThemeSwitch";
import "./globals.css";

export const metadata: Metadata = {
  title: "Soft_Inmo",
  description: "Sistema operativo para empresas inmobiliarias",
  appleWebApp: { capable: true, title: "Soft_Inmo", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#0b3c49" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Aplica el tema elegido antes de pintar la página. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <InstallApp />
      </body>
    </html>
  );
}
