/** Postgres `numeric` columns come back as strings via the driver — coerce defensively. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The same "landed cost" formula used on the frontend
 * (computeItemCostBreakdown in procurement.api.ts): (unitCost x quantity)
 * minus discount, plus tax, plus flat transport/customs — then divided back
 * down to a per-unit figure so it can be stored as InventoryItem.unitCost
 * when a delivered purchase request is auto-received into Inventory.
 */
export function computeLandedUnitCost(item: {
  unitCost?: number | string | null;
  estimatedCost?: number | string | null;
  quantity: number;
  discountPercent?: number | string | null;
  taxPercent?: number | string | null;
  transportCost?: number | string | null;
  customsCost?: number | string | null;
}): number {
  const unitCost = num(item.unitCost ?? item.estimatedCost);
  const quantity = item.quantity > 0 ? item.quantity : 1;
  const subtotal = unitCost * quantity;
  const discountAmount = subtotal * (num(item.discountPercent) / 100);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (num(item.taxPercent) / 100);
  const total = taxableAmount + taxAmount + num(item.transportCost) + num(item.customsCost);
  return total / quantity;
}
