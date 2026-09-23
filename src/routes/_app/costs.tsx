import { createFileRoute } from "@tanstack/react-router";
import { CostsPage } from "@/custom/costs/client/CostsPage";

export const Route = createFileRoute("/_app/costs")({
  head: () => ({ meta: [{ title: "Costes" }] }),
  component: CostsPage,
});
