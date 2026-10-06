import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native/Node-heavy packages stay out of the server bundle.
  // (pino and thread-stream are already on Next.js's built-in list.)
  serverExternalPackages: ["bullmq", "pg", "@azure/monitor-opentelemetry", "@azure/communication-email"],
  experimental: {
    // Tree-shake Mantine and icon barrels.
    optimizePackageImports: ["@mantine/core", "@mantine/hooks", "@tabler/icons-react"],
  },
};

export default nextConfig;
