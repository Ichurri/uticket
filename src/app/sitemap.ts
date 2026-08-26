import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site";

/** Static pages plus every approved, still-upcoming event, so the catalog
 * is actually discoverable instead of living only behind shared links. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const events = await prisma.event.findMany({
    where: { status: "APPROVED", date: { gte: startOfToday } },
    select: { id: true, updatedAt: true },
    orderBy: { date: "asc" },
  });

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/events"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/help"), changeFrequency: "monthly", priority: 0.3 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    {
      url: absoluteUrl("/become-organizer"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  return [
    ...staticRoutes,
    ...events.map((event) => ({
      url: absoluteUrl(`/events/${event.id}`),
      lastModified: event.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
