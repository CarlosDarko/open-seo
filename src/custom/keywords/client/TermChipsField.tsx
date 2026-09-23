import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Minus, Plus, X } from "lucide-react";
import {
  MAX_TERMS_PER_KIND,
  MAX_TERM_LENGTH,
  MIN_TERM_LENGTH,
  normalizeTerm,
  sanitizeTerms,
} from "@/custom/keywords/termFilters";

type Props = {
  label: string;
  help: string;
  placeholder: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** "include" terms are required; "exclude" terms are discarded. */
  tone: "include" | "exclude";
};

/**
 * Tag input for the keyword term filters: type a word and press Enter or a
 * comma to turn it into a chip; click a chip's × (or Backspace on an empty
 * field) to remove it. Pasting "a, b, c" adds three chips.
 */
export function TermChipsField({
  label,
  help,
  placeholder,
  value,
  onChange,
  tone,
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
      pieces.length > added ? `Se añadieron ${added} de ${pieces.length}.` : null,
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

  const chipClass =
    tone === "include"
      ? "border-base-300 bg-base-200 text-base-content"
      : "border-error/30 bg-error/10 text-error";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="flex items-center gap-1.5 text-sm font-medium text-base-content/80"
        >
          <span
            className={`flex size-4 items-center justify-center rounded-full ${
              tone === "include" ? "bg-base-300" : "bg-error/15 text-error"
            }`}
            aria-hidden
          >
            <Icon className="size-3" strokeWidth={3} />
          </span>
          {label}
        </label>
        <span
          className="text-xs tabular-nums text-base-content/50"
          aria-label={`${value.length} de ${MAX_TERMS_PER_KIND} palabras`}
        >
          {value.length}/{MAX_TERMS_PER_KIND}
        </span>
      </div>

      <div
        className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-base-300 bg-base-100 px-2.5 py-1.5 transition-colors focus-within:border-primary"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((term) => (
          <span
            key={term}
            className={`inline-flex max-w-full items-center gap-1 rounded-md border py-0.5 pl-2 pr-1 text-sm ${chipClass}`}
          >
            <span className="truncate">{term}</span>
            <button
              type="button"
              className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-base-content/10"
              aria-label={`Quitar ${term}`}
              onClick={(event) => {
                event.stopPropagation();
                onChange(value.filter((item) => item !== term));
                setMessage(null);
              }}
            >
              <X className="size-3" />
            </button>
          </span>
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
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/40 disabled:cursor-not-allowed"
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
        className={`text-xs ${message ? "font-medium text-base-content/90" : "text-base-content/55"}`}
        role={message ? "status" : undefined}
      >
        {message ?? help}
      </p>
    </div>
  );
}
