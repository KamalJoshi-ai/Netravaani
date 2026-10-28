import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

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
      <body className="bg-[#F7F6F2] dark:bg-[#0E151E] text-[#18212B] dark:text-[#F0F4F7] font-sans antialiased min-h-screen selection:bg-[#B9D8D2]/40">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
