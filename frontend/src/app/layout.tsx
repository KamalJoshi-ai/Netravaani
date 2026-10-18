import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "NetraVaani",
  description: "Assistive Gaze & Gesture Clinical Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F5F1E9] text-[#211C19] font-sans antialiased selection:bg-[#AD5D3D]/20 selection:text-[#211C19] min-h-screen">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
