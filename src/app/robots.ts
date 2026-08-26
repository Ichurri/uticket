import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private or single-use surfaces: nothing here belongs in an index,
      // and /scan/* URLs are bearer credentials for the door.
      disallow: [
        "/api/",
        "/account",
        "/admin",
        "/cart",
        "/dashboard",
        "/orders",
        "/scan/",
        "/reset-password",
        "/verify-email",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
