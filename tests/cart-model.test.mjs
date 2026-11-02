import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeCartItems,
  normalizeCartItems,
  serializeCartItems
} from "../frontend/src/features/cart/cartModel.js";

test("cart normalization validates ids and quantities, and combines duplicate lines", () => {
  const result = normalizeCartItems([
    { id: "helmet-1", variantId: null, qty: 2, extra: "ignored" },
    { id: "helmet-1", variantId: null, qty: 3 },
    { id: "helmet-1", variantId: "large", qty: 1 },
    { id: "bad id", qty: 1 },
    { id: "gloves", qty: 0 },
    { id: "boots", qty: 1.5 }
  ]);

  assert.deepEqual(result, [
    { key: "helmet-1::base", id: "helmet-1", variantId: null, qty: 5 },
    { key: "helmet-1::large", id: "helmet-1", variantId: "large", qty: 1 }
  ]);
});

test("cart merge preserves account and guest lines while capping line quantity", () => {
  const result = mergeCartItems(
    [{ id: "helmet-1", variantId: null, qty: 70 }],
    [{ id: "helmet-1", variantId: null, qty: 50 }, { id: "gloves", qty: 1 }]
  );

  assert.deepEqual(result, [
    { key: "helmet-1::base", id: "helmet-1", variantId: null, qty: 99 },
    { key: "gloves::base", id: "gloves", variantId: null, qty: 1 }
  ]);
});

test("serialized carts contain only checkout item identifiers and quantities", () => {
  assert.deepEqual(
    serializeCartItems([{ key: "helmet-1::base", id: "helmet-1", variantId: null, qty: 2, price: 999 }]),
    [{ id: "helmet-1", variantId: null, qty: 2 }]
  );
});