import { ExternalLink } from "lucide-react";
import { googleSearchUrl, pathOf } from "@/custom/radar/format";

const linkClass =
  "inline-flex max-w-full items-center gap-1 break-all text-primary underline-offset-2 hover:underline";

/** A page of the site, opened in a new tab. */
export function PageLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className={linkClass}
    >
      <span>{pathOf(url) === "/" ? "Página de inicio (/)" : pathOf(url)}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  );
}

/** The Google results for a query, to compare against what ranks. */
export function GoogleLink({
  query,
  label,
  subtle,
}: {
  query: string;
  label?: string;
  /** Plain text color instead of the link color, for long tables. */
  subtle?: boolean;
}) {
  return (
    <a
      href={googleSearchUrl(query)}
      target="_blank"
      rel="noopener noreferrer"
      className={
        subtle
          ? "inline-flex max-w-full items-center gap-1 text-foreground underline-offset-2 hover:text-primary hover:underline"
          : linkClass
      }
    >
      <span>{label ?? `Ver «${query}» en Google`}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  );
}
