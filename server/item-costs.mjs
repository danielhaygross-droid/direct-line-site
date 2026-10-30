// Cost per product (Erwin, 30 Oct 2026): the supplier types one cost per product in the sheet ("Cost per product"),
// e.g. "10.90, 9.00, 11.00" (Ada also uses the Chinese commas 、 ，), in the order of the product links. The client sees
// each product's share of the order price (the costs scaled to the price, so they add up to it and nothing else shows);
// null unless there is one cost for every product. Own file: portal.mjs and supplier-sheet.mjs both use it.
export function itemCostList(text) {
  const parts = String(text ?? '').split(/[,;\n、，；]+/).map(p => p.match(/\d+(?:\.\d+)?/g)).filter(Boolean);
  return parts.map(m => Number(m.at(-1)));
}
export const productLinkList = etsyUrl => String(etsyUrl || '').split(/\s+/).filter(Boolean);
export function itemPrices(r) {
  const links = productLinkList(r.etsy_url), costs = itemCostList(r.item_costs), price = Number(r.price || 0);
  if (links.length < 2 || costs.length !== links.length || !(price > 0)) return null;
  const sum = costs.reduce((n, c) => n + c, 0); if (!(sum > 0)) return null;
  const cents = Math.round(price * 100), out = costs.map(c => Math.round(c / sum * cents));
  out[out.length - 1] += cents - out.reduce((n, c) => n + c, 0);
  return out.map(c => c / 100);
}
