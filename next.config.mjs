/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output gives a small self-contained server for the Cloud Run image.
  output: "standalone",
  // The Google Cloud clients use gRPC and native Node features, so load them with
  // plain require instead of bundling them.
  serverExternalPackages: ["@google-cloud/firestore", "@google-cloud/bigquery"],
};

export default nextConfig;
