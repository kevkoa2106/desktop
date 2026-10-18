import { useEffect, useState } from "react";
import { api, mediaUrl, toMaxQualityAvatarUrl } from "@/shared/api";
import { runWorkerPool } from "@/shared/utils/workerPool";
import type { LibraryItemViewModel } from "../types";

export type EntityType = "album" | "artist" | "playlist";

type SavedCollectionSummary = {
  id: string;
  title?: string;
  name?: string;
  author?: string;
  year?: number;
  trackCount?: number;
  cover?: { url: string };
};

type SavedCollectionEntry = {
  savedAt: string;
  album?: SavedCollectionSummary;
  artist?: SavedCollectionSummary;
  playlist?: SavedCollectionSummary;
};

function toViewModel(
  type: EntityType,
  entry: SavedCollectionEntry,
  value: SavedCollectionSummary,
  details?: SavedCollectionSummary,
): LibraryItemViewModel {
  const title =
    type === "artist"
      ? details?.name || value.name
      : details?.title || value.title;
  const cover = details?.cover?.url ? details.cover : value.cover;
  const year = details?.year ?? value.year;
  const trackCount = details?.trackCount ?? value.trackCount;
  const rawCover = cover?.url ? mediaUrl(cover.url) : "";

  return {
    id: value.id,
    title: title || "",
    subtitle:
      type === "artist"
        ? "Artist"
        : type === "playlist"
          ? (value.author || (trackCount ? `${trackCount} tracks` : "Playlist"))
          : [year, trackCount ? `${trackCount} tracks` : undefined]
              .filter(Boolean)
              .join(" • "),
    imageUrl: type === "artist" ? toMaxQualityAvatarUrl(rawCover) : rawCover,
    kind: type,
    href:
      type === "artist"
        ? `/artist?id=${encodeURIComponent(value.id)}`
        : type === "playlist"
          ? `/collection?type=playlist&id=${encodeURIComponent(value.id)}`
          : `/collection?type=album&id=${encodeURIComponent(value.id)}`,
    addedAt: entry.savedAt,
    trackCount,
    isOwned: false,
  };
}

export function useExternalItems(type: EntityType) {
  const [data, setData] = useState<LibraryItemViewModel[]>([]);
  useEffect(() => {
    let active = true;
    let loadSequence = 0;
    const load = async () => {
      const sequence = ++loadSequence;
      try {
        const collectionType =
          type === "album" ? "albums" : type === "artist" ? "artists" : "playlists";
        const response = await api.listSavedCollections(collectionType);
        if (!active || sequence !== loadSequence) return;
        const entries = (response.items as SavedCollectionEntry[]).flatMap((entry) => {
          const value = entry[type];
          return value?.id ? [{ entry, value }] : [];
        });

        setData(entries.map(({ entry, value }) => toViewModel(type, entry, value)));
        void runWorkerPool(entries, 4, async ({ entry, value }, index) => {
          const title = type === "artist" ? value.name : value.title;
          if (
            !active ||
            sequence !== loadSequence ||
            type === "playlist" ||
            (title && value.cover?.url)
          ) {
            return;
          }

          try {
            const details =
              type === "album"
                ? await api.getAlbum(value.id)
                : await api.getArtist(value.id);
            if (!details || !active || sequence !== loadSequence) return;

            const hydratedItem = toViewModel(type, entry, value, details);
            setData((current) => {
              if (!active || sequence !== loadSequence || !current[index]) return current;
              return current.map((item, itemIndex) =>
                itemIndex === index ? hydratedItem : item,
              );
            });
          } catch {
            // Keep the saved summary when catalog details are unavailable.
          }
        });
      } catch {
        if (active && sequence === loadSequence) setData([]);
      }
    };
    void load();
    const refresh = () => void load();
    window.addEventListener("library:changed", refresh);
    window.addEventListener("auth:changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("library:changed", refresh);
      window.removeEventListener("auth:changed", refresh);
    };
  }, [type]);
  return { data };
}
