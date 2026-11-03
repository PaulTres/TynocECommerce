/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // next/image only optimises images from hosts listed here (prevents abuse of the optimiser).
    images: {
        remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
    },
    // Defence-in-depth headers applied to every response.
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                ],
            },
        ];
    },
};
export default nextConfig;
