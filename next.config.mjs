/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output gives a small self-contained server for the Cloud Run image.
  output: "standalone",
};

export default nextConfig;
