import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { SectionHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import {
  getReportPageTypes,
  saveReportPageTypes,
} from "@/serverFunctions/reporting";

const NEWLINE = String.fromCharCode(10);
type Draft = { name: string; urls: string };

export const pageTypesKey = (projectId: string) =>
  ["report-page-types", projectId] as const;

/** The page types of the client's site, each with one to five example pages.
 *  It sits in the project's Context page (a build patch mounts it there) and
 *  the reports audit these pages with Microaudit. */
export function PageTypesSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: pageTypesKey(projectId),
    queryFn: () => getReportPageTypes({ data: { projectId } }),
  });
  const [types, setTypes] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (saved.data && !loaded) {
      setTypes(
        saved.data.map((type) => ({
          name: type.name,
          urls: type.urls.join(NEWLINE),
        })),
      );
      setLoaded(true);
    }
  }, [saved.data, loaded]);

  const valid = types
    .map((type) => ({
      name: type.name.trim(),
      urls: type.urls
        .split(NEWLINE)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 5),
    }))
    .filter((type) => type.name && type.urls.length > 0);

  const save = useMutation({
    mutationFn: () =>
      saveReportPageTypes({ data: { projectId, types: valid } }),
    onSuccess: () => {
      setMessage("Tipologías guardadas.");
      void queryClient.invalidateQueries({ queryKey: pageTypesKey(projectId) });
    },
    onError: () =>
      setMessage(
        "No se pudieron guardar. Cada dirección debe empezar por https://.",
      ),
  });

  const update = (index: number, patch: Partial<Draft>) =>
    setTypes((previous) =>
      previous.map((type, at) => (at === index ? { ...type, ...patch } : type)),
    );

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Tipologías de página"
        hint="Una a cinco páginas de ejemplo de cada tipo de página del sitio (inicio, categoría, producto, blog…). Los informes las auditan con Microaudit y analizan las plantillas del sitio."
      />
      <div className="space-y-3">
        {types.map((type, index) => (
          <div key={index} className="space-y-1.5 rounded-lg border p-3">
            <div className="flex gap-2">
              <Input
                value={type.name}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
                placeholder="Tipología (por ejemplo, Producto)"
                aria-label="Nombre de la tipología"
                maxLength={40}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Quitar tipología"
                onClick={() =>
                  setTypes((previous) =>
                    previous.filter((_, at) => at !== index),
                  )
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
            <Textarea
              rows={3}
              value={type.urls}
              onChange={(event) => update(index, { urls: event.target.value })}
              placeholder="https://… (una por línea, máximo 5)"
              aria-label="Páginas de ejemplo"
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={types.length >= 8}
            onClick={() =>
              setTypes((previous) => [...previous, { name: "", urls: "" }])
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Añadir tipología
          </Button>
          <Button
            size="sm"
            disabled={save.isPending || valid.length === 0}
            onClick={() => save.mutate()}
          >
            Guardar tipologías
          </Button>
          {message ? (
            <span className="text-xs text-muted-foreground">{message}</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
