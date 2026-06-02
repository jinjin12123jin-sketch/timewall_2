import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  ...(isGithubPages
    ? {
        basePath: "/timewall_2",
        assetPrefix: "/timewall_2/",
      }
    : {}),
};

export default nextConfig;
