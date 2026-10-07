import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/client/components/ui/dialog";
import { Textarea } from "@/client/components/ui/textarea";
import type { RadarReport } from "@/custom/radar/actions";
import { integer } from "@/custom/radar/format";
import { saveRadarBrand } from "@/serverFunctions/radar";

type Brand = RadarReport["brand"];

function parseTerms(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

/** Lets the user say which words identify the brand: its name, variants and
 *  misspellings. Shows what is counted as brand today and which queries look
 *  like misspellings that are not being counted. */
export function BrandDialog({
  projectId,
  brand,
}: {
  projectId: string;
  brand: Brand;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const save = useMutation({
    mutationFn: (terms: string[]) =>
      saveRadarBrand({ data: { projectId, terms } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["radar", projectId] });
      setOpen(false);
    },
  });

  const terms = parseTerms(text);
  const addVariant = (variant: string) => {
    const current = parseTerms(text);
    if (current.some((term) => term.toLowerCase() === variant.toLowerCase())) {
      return;
    }
    setText([...current, variant].join("\n"));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setText(brand.terms.join("\n"));
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Tag className="size-4" aria-hidden />
        Marca: {brand.terms.slice(0, 2).join(", ") || "sin definir"}
        {brand.terms.length > 2 ? ` +${brand.terms.length - 2}` : ""}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Marca de este proyecto</DialogTitle>
          <DialogDescription>
            Escribe el nombre de la marca, sus variantes y las erratas que
            teclea la gente, una por línea. Una consulta cuenta como de marca si
            contiene alguna, sin importar mayúsculas, acentos ni espacios
            («carlos ortega» y «carlosortega» son lo mismo).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              placeholder={"carlos ortega\ncarlosortega\ncarlso ortega"}
              aria-label="Palabras de marca"
            />
            <p className="text-xs text-muted-foreground">
              {brand.source === "auto"
                ? `Ahora se deduce solo del dominio: ${brand.autoSuggestion.join(", ") || "no se pudo deducir"}. Al guardar tu lista, deja de usarse.`
                : "Lista guardada por ti. Déjala vacía para volver a deducirla del dominio."}
            </p>
          </div>

          {brand.examples.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium">Consultas que ahora cuentan como marca</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {brand.examples.map((example) => (
                  <li key={example.query}>
                    «{example.query}» · {integer.format(example.clicks)}{" "}
                    {example.clicks === 1 ? "clic" : "clics"}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Ahora mismo ninguna consulta cuenta como de marca.
            </p>
          )}

          {brand.suspects.length > 0 ? (
            <div className="space-y-1.5">
              <p className="font-medium">
                Posibles erratas que NO se cuentan como marca
              </p>
              <ul className="space-y-1">
                {brand.suspects.map((suspect) => (
                  <li
                    key={suspect.query}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      «{suspect.query}»{" "}
                      <span className="text-muted-foreground">
                        · {integer.format(suspect.clicks)}{" "}
                        {suspect.clicks === 1 ? "clic" : "clics"}
                      </span>
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => addVariant(suspect.variant)}
                    >
                      <Plus className="size-3" aria-hidden />
                      Añadir «{suspect.variant}»
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate(terms)}
          >
            {save.isPending ? "Guardando…" : "Guardar marca"}
          </Button>
        </DialogFooter>
        {save.isError ? (
          <p className="text-sm text-destructive">
            No se pudo guardar. Prueba de nuevo.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
