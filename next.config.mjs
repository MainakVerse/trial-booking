/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pg", "nodemailer"],
    instrumentationHook: true,
    // Keep visited and prefetched pages in the browser for 30s so going back and forth is instant.
    staleTimes: { dynamic: 30, static: 180 },
  },
};
export default nextConfig;
