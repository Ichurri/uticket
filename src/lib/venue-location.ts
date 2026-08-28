/**
 * Google Maps link → coordinates, best effort.
 *
 * The organizer pastes one link. If we can read lat/lng out of it we store
 * them; if we cannot, the venue still saves and the form falls back to two
 * manual inputs. The original link is always kept verbatim so "Cómo llegar"
 * opens exactly what they pasted.
 */

/** `@lat,lng`, `?q=lat,lng`, `!3dlat!4dlng`, and bare `lat,lng`. */
const PATTERNS = [
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  /[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /^\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)\s*$/,
];

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function parseCoordinates(url: string): Coordinates | null {
  for (const pattern of PATTERNS) {
    const match = url.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      return { latitude, longitude };
    }
  }
  return null;
}

export function isShortMapsLink(url: string) {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(url.trim());
}

/** Short links carry no coordinates until they are followed. */
export async function expandShortLink(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    return response.url || null;
  } catch {
    return null;
  }
}

export async function resolveCoordinates(
  url: string,
): Promise<Coordinates | null> {
  const direct = parseCoordinates(url);
  if (direct) return direct;
  if (!isShortMapsLink(url)) return null;
  const expanded = await expandShortLink(url);
  return expanded ? parseCoordinates(expanded) : null;
}

/**
 * What to persist. Explicit coordinates from the manual fallback always win;
 * otherwise we try to read them off the link. Failing to parse is never an
 * error — the venue saves with no coordinates and the map just doesn't show.
 */
export async function resolveVenueLocation(input: {
  googleMapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const googleMapsUrl = input.googleMapsUrl?.trim() || null;

  if (
    input.latitude !== null &&
    input.latitude !== undefined &&
    input.longitude !== null &&
    input.longitude !== undefined
  ) {
    return {
      googleMapsUrl,
      latitude: input.latitude,
      longitude: input.longitude,
    };
  }

  const coordinates = googleMapsUrl
    ? await resolveCoordinates(googleMapsUrl)
    : null;

  return {
    googleMapsUrl,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };
}

/** Embed URL that works without an API key or billing account. */
export function mapsEmbedUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;
}
