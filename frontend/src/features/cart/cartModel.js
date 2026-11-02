const GUEST_CART_KEY = 'strawping.cart';
const CART_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_LINE_QUANTITY = 99;

export function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];

  const lines = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const variantId = item.variantId == null || item.variantId === ''
      ? null
      : typeof item.variantId === 'string' ? item.variantId.trim() : '';
    const quantity = Number(item.qty);
    if (
      !CART_ID_PATTERN.test(id)
      || (variantId !== null && !CART_ID_PATTERN.test(variantId))
      || !Number.isInteger(quantity)
      || quantity < 1
    ) continue;

    const key = `${id}::${variantId || 'base'}`;
    const current = lines.get(key);
    lines.set(key, {
      key,
      id,
      variantId,
      qty: Math.min(MAX_LINE_QUANTITY, (current?.qty || 0) + Math.min(quantity, MAX_LINE_QUANTITY)),
    });
  }
  return [...lines.values()];
}

export function serializeCartItems(items) {
  return normalizeCartItems(items).map(({ id, variantId, qty }) => ({ id, variantId, qty }));
}

export function mergeCartItems(primaryItems, secondaryItems) {
  return normalizeCartItems([
    ...normalizeCartItems(primaryItems),
    ...normalizeCartItems(secondaryItems),
  ]);
}

export function readGuestCart() {
  try {
    return normalizeCartItems(JSON.parse(window.localStorage.getItem(GUEST_CART_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function saveGuestCart(items) {
  try {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(serializeCartItems(items)));
  } catch {
    // Keep the current cart usable in memory when browser storage is unavailable.
  }
}

export function clearGuestCart() {
  try {
    window.localStorage.removeItem(GUEST_CART_KEY);
  } catch {
    // Storage may be unavailable in private or sandboxed browsing contexts.
  }
}