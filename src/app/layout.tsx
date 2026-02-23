import type { Metadata } from "next";
import LiveWallpaper from "@/components/live-wallpaper";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "xiao.sh",
  description: "Minimal portfolio with AI project search",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} antialiased`}>
        <LiveWallpaper />
        <div className="live-wallpaper-dim" aria-hidden="true" />
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
