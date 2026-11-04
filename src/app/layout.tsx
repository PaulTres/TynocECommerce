import { HeaderErrorBoundary } from "@/components/ErrorBoundary";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
    title: {
        default: `${SITE_NAME} - everyday goods, well chosen`,
        template: `%s | ${SITE_NAME}`,
    },
    description:
        "A full-stack e-commerce demo built with Next.js, Neon Managed Auth and Neon Postgres.",
};

/** Root layout: persistent header/footer around every page. */
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={cn("font-sans", geist.variable)}>
            <body className="flex min-h-screen flex-col">
                <HeaderErrorBoundary>
                    <Header />
                </HeaderErrorBoundary>
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
                    {children}
                </main>
                <Footer />
            </body>
        </html>
    );
}
