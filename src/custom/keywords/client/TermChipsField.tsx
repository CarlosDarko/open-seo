import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  MAX_TERMS_PER_KIND,
  MAX_TERM_LENGTH,
  MIN_TERM_LENGTH,
  normalizeTerm,
  sanitizeTerms,
  type TermMatch,
} from "@/custom/keywords/termFilters";

type Props = {
  label: string;
  help: string;
  placeholder: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** "include" terms are required; "exclude" terms are discarded. */
  tone: "include" | "exclude";
  /** How several terms combine: all together (Y) or any one of them (O). */
  match: TermMatch;
  onMatchChange: (next: TermMatch) => void;
  matchTitles: Record<TermMatch, string>;
};

/**
 * Tag input for the keyword term filters: type a word and press Enter or a
 * comma to turn it into a chip; click a chip's × (or Backspace on an empty
 * field) to remove it. Pasting "a, b, c" adds three chips. From two chips on,
 * a Y | O switch chooses how they combine.
 */
export function TermChipsField({
  label,
  help,
  placeholder,
  value,
  onChange,
  tone,
  match,
  onMatchChange,
  matchTitles,
}: Props) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const isFull = value.length >= MAX_TERMS_PER_KIND;
  const Icon = tone === "include" ? Plus : Minus;

  function commit(rawText: string) {
    const pieces = rawText.split(",").filter((piece) => piece.trim() !== "");
    if (pieces.length === 0) return;

    const next = sanitizeTerms([...value, ...pieces]);
    const added = next.length - value.length;
    if (added === 0) {
      const first = normalizeTerm(pieces[0]);
      setMessage(
        value.includes(first)
          ? "Ya lo has añadido."
          : first.length < MIN_TERM_LENGTH
            ? `Escribe al menos ${MIN_TERM_LENGTH} letras.`
            : first.length > MAX_TERM_LENGTH
              ? `Máximo ${MAX_TERM_LENGTH} caracteres.`
              : isFull
                ? `Máximo ${MAX_TERMS_PER_KIND} palabras.`
                : "Usa letras, no solo números o símbolos.",
      );
      return;
    }
    setMessage(
      pieces.length > added
        ? `Se añadieron ${added} de ${pieces.length}.`
        : null,
    );
    setDraft("");
    onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
      setMessage(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="flex items-center gap-1.5 text-sm font-medium"
        >
          <span
            aria-hidden
            className={`flex size-4 items-center justify-center rounded-full ${
              tone === "include"
                ? "bg-foreground/10"
                : "bg-destructive/15 text-destructive"
            }`}
          >
            <Icon className="size-3" strokeWidth={3} />
          </span>
          {label}
        </label>
        <div className="flex items-center gap-2">
          {value.length > 1 ? (
            <div
              role="group"
              aria-label={`Cómo se combinan las palabras de «${label}»`}
              className="flex items-center gap-1"
            >
              {(["all", "any"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="xs"
                  variant={match === mode ? "default" : "outline"}
                  aria-pressed={match === mode}
                  title={matchTitles[mode]}
                  className="min-w-7"
                  onClick={() => onMatchChange(mode)}
                >
                  {mode === "all" ? "Y" : "O"}
                </Button>
              ))}
            </div>
          ) : null}
          <span
            className="text-xs tabular-nums text-muted-foreground"
            title={`Máximo ${MAX_TERMS_PER_KIND} palabras en este campo (DataForSEO admite 8 condiciones por búsqueda entre los dos campos).`}
          >
            {value.length} de {MAX_TERMS_PER_KIND}
          </span>
        </div>
      </div>

      {/* A click anywhere in the box focuses the input. */}
      <div
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((term) => (
          <Badge
            key={term}
            variant={tone === "include" ? "secondary" : "destructive"}
            className="h-6 max-w-full gap-1 pr-1 text-sm"
          >
            <span className="truncate">{term}</span>
            <button
              type="button"
              className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-foreground/10"
              aria-label={`Quitar ${term}`}
              onClick={(event) => {
                event.stopPropagation();
                onChange(value.filter((item) => item !== term));
                setMessage(null);
              }}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={draft}
          disabled={isFull}
          maxLength={MAX_TERM_LENGTH * 4}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={helpId}
          placeholder={
            isFull
              ? "Máximo alcanzado"
              : value.length === 0
                ? placeholder
                : "Añadir otra…"
          }
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(event) => {
            setDraft(event.target.value);
            if (message) setMessage(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (text.includes(",")) {
              event.preventDefault();
              commit(text);
            }
          }}
        />
      </div>

      <p
        id={helpId}
        className={`text-xs ${message ? "font-medium text-foreground" : "text-muted-foreground"}`}
        role={message ? "status" : undefined}
      >
        {message ?? help}
      </p>
    </div>
  );
}
