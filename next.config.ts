import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        // Keep every page and image out of search results and AI datasets,
        // for crawlers that fetch a page despite robots.txt.
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, noimageindex, noai, noimageai" }],
      },
    ];
  },
};

export default nextConfig;
