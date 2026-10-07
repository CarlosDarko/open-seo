import {
  KIND_COLOR,
  KIND_SHORT,
  type GoogleUpdateKind,
} from "@/custom/radar/googleUpdates";

/** The kind of a Google update as a coloured badge; all the same width so
 *  lists line up. */
export function UpdateBadge({ kind }: { kind: GoogleUpdateKind }) {
  return (
    <span
      className="inline-block min-w-16 rounded px-1.5 py-0.5 text-center text-[10px] font-bold text-white"
      style={{ backgroundColor: KIND_COLOR[kind] }}
    >
      {KIND_SHORT[kind]}
    </span>
  );
}

/** Marks an update that is still rolling out. */
export function OngoingTag() {
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-destructive">
      <span
        className="size-1.5 animate-pulse rounded-full bg-destructive"
        aria-hidden
      />
      en curso
    </span>
  );
}
