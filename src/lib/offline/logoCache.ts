/**
 * Helper to cache restaurant logo as a base64 Data URL for offline slip printing.
 */
export async function cacheLogoAsDataUrl(url: string): Promise<void> {
  if (!url || typeof window === "undefined" || !url.startsWith("http")) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        try {
          localStorage.setItem("cached_restaurant_logo_data_url", reader.result);
        } catch {}
      }
    };
    reader.readAsDataURL(blob);
  } catch {}
}

export function getCachedLogoDataUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("cached_restaurant_logo_data_url") || "";
  } catch {
    return "";
  }
}
