import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  serverExternalPackages: ["firebase-admin", "pdfkit"],
  // Build-time reduction: tree-shake heavy barrel packages at import so the
  // production compile graph stays small (this codebase pulls a LOT of
  // lucide-react icons + charts + Radix across the new HR/appraisal/goals
  // surfaces). Cuts both build time and memory — the Hobby 2-core/8GB builder
  // was hitting the 45-min timeout on the full cold graph.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-separator",
      "@tanstack/react-table",
      "cmdk",
    ],
  },
};

export default nextConfig;
