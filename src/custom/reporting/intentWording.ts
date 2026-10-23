// The part of the search-intent classification that only needs the wording of
// the query (no network, so it can be tested on its own).
export type Intent = "Marca" | "Informativa" | "Comparativa" | "Transaccional";

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Words that settle the intent, in the languages the sites of the consultant
// work in (Spanish, Catalan, English, French, Italian, Portuguese).
const TRANSACTIONAL =
  /\b(comprar|compra|comprare|acquistare|acquisto|acheter|achat|buy|purchase|precio|precios|preu|preus|price|prices|prix|prezzo|prezzi|preco|precos|barato|baratos|barata|economico|cheap|offerta|offerte|oferta|ofertas|oferte|promo|descuento|descuentos|descompte|discount|sconto|sconti|remise|desconto|cupon|cupones|coupon|codigo descuento|tienda|botiga|shop|store|boutique|negozio|loja|pedir|pedido|comanda|ordering|order|envio|enviament|shipping|livraison|spedizione|presupuesto|pressupost|cotizacion|quote|devis|preventivo|orcamento|contratar|contractar|hire|alquiler|lloguer|rent|noleggio|location|aluguer|venta|venda|vendita|vente|sale|a domicilio|cerca de mi|near me|pres de moi|vicino a me|perto de mim|online|en linea|distribuidor|distribuidores|proveedor|proveedores|mayorista|comprar online|catalogo|catalogue|catalog)\b/;
const COMPARATIVE =
  /\b(mejor|mejores|millor|millors|best|top|meilleur|meilleurs|meilleure|migliore|migliori|melhor|melhores|vs|versus|comparativa|comparar|comparacion|comparison|compare|comparatif|confronto|alternativa|alternativas|alternative|alternatives|alternativ|opiniones|opinion|opinions|valoraciones|resenas|resena|reviews|review|avis|recensioni|recensione|avaliacoes|ranking|clasificacion|recomendado|recomendados|recommended|recommande|consigliato)\b/;
const INFORMATIONAL =
  /\b(que|como|cuando|donde|quien|quienes|cual|cuales|cuanto|cuanta|cuantos|por que|porque|para que|puede|pueden|se puede|es posible|what|how|why|when|where|who|which|can|does|is|are|qu est ce|comment|pourquoi|quand|ou est|quel|quelle|cos e|come|perche|quando|dove|quale|o que|como fazer|por que|quando|onde|qual|significado|significat|meaning|definicion|definicio|definition|que es|que son|ejemplo|ejemplos|exemple|example|examples|esempio|guia|guide|guida|tutorial|pasos|steps|etapes|passaggi|requisitos|requirements|plazo|plazos|tipos de|tipus de|types of|types|tipi di|types de|diferencia|diferencias|difference|differences|diferenca|para que sirve|sirve|funcion|funciones|caracteristicas|ventajas|desventajas|beneficios|propiedades|sintomas|causas|tratamiento|nomenclatura|historia|pdf|wikipedia)\b/;

/** The intent that the wording alone settles, or null when it does not. */
export function intentFromWording(query: string): Intent | null {
  const text = plain(query);
  if (query.includes("?")) return "Informativa";
  if (COMPARATIVE.test(text)) return "Comparativa";
  if (TRANSACTIONAL.test(text)) return "Transaccional";
  if (INFORMATIONAL.test(text)) return "Informativa";
  return null;
}
