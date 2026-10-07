import { useState } from "react";
import { ExternalLink, Megaphone, X } from "lucide-react";
import { useGoogleUpdates } from "@/custom/radar/client/useGoogleUpdates";

const STORAGE_KEY = "google-update-banner-hidden-v1";
// An update with no end date this old is a gap in Google's page, not a
// rollout still going on (they last two or three weeks).
const MAX_ONGOING_DAYS = 35;

function hiddenIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

const dayFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * A slim red strip across the top of every page while Google is rolling out a
 * ranking update: the figures of those days can swing for reasons that have
 * nothing to do with the site. It can be hidden for that update.
 */
export function GoogleUpdateBanner({ ready }: { ready: boolean }) {
  const updates = useGoogleUpdates(ready);
  const [hidden, setHidden] = useState<string[]>(hiddenIds);

  const oldest = new Date(Date.now() - MAX_ONGOING_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const ongoing = (updates.data ?? []).filter(
    (update) =>
      update.end === null &&
      update.begin >= oldest &&
      !hidden.includes(update.id),
  );
  if (ongoing.length === 0) return null;

  const hide = () => {
    const next = [...hidden, ...ongoing.map((update) => update.id)];
    setHidden(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // It reappears next visit.
    }
  };

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-destructive px-4 py-1.5 text-xs text-white"
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <Megaphone className="size-3.5" aria-hidden />
        <span
          className="size-1.5 animate-pulse rounded-full bg-white"
          aria-hidden
        />
        Update de Google en curso
      </span>
      <span>
        {ongoing.map((update, index) => (
          <span key={update.id}>
            {index > 0 ? " · " : ""}
            {update.label}, desde el{" "}
            {dayFormat.format(new Date(`${update.begin}T00:00:00Z`))}
          </span>
        ))}
        . Las cifras de estos días pueden oscilar.
      </span>
      <a
        href={ongoing[0].url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
      >
        Ver en Google
        <ExternalLink className="size-3" aria-hidden />
      </a>
      <button
        type="button"
        onClick={hide}
        className="rounded p-0.5 hover:bg-white/20"
        aria-label="Ocultar este aviso"
        title="Ocultar este aviso"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
