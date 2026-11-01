-- Strawping inventory: transaction-safe inventory adjustments and checkout.
-- Run once in the Supabase SQL editor (or apply as a migration).

-- Backfill explicit inventory fields. Existing simple products start at zero:
-- enter their real quantities in Admin > Stock Management before reopening sales.
UPDATE public.store_data
SET value = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN jsonb_typeof(item) = 'object' THEN
        jsonb_set(
          jsonb_set(item, '{stock}', COALESCE(item->'stock', '0'::jsonb), true),
          '{inStock}', COALESCE(item->'inStock', 'true'::jsonb), true
        )
      ELSE item
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END) AS p(item)
)
WHERE key = 'products';

-- Existing variants keep their current stock counts and gain an independent
-- availability flag. Product-level stock is retained for non-variant products.
UPDATE public.store_data AS sd
SET value = (
  SELECT jsonb_agg(
    CASE WHEN item->>'hasVariants' = 'true' AND jsonb_typeof(item->'variants') = 'array'
      THEN jsonb_set(item, '{variants}', (
        SELECT jsonb_agg(
          jsonb_set(variant, '{inStock}', COALESCE(variant->'inStock', 'true'::jsonb), true)
          ORDER BY variant_ord
        )
        FROM jsonb_array_elements(item->'variants') WITH ORDINALITY AS v(variant, variant_ord)
      ), true)
      ELSE item
    END
    ORDER BY item_ord
  )
  FROM jsonb_array_elements(sd.value) WITH ORDINALITY AS p(item, item_ord)
)
WHERE sd.key = 'products' AND jsonb_typeof(sd.value) = 'array';

CREATE OR REPLACE FUNCTION public.admin_adjust_inventory(
  p_product_id text,
  p_variant_id text DEFAULT NULL,
  p_stock integer DEFAULT NULL,
  p_in_stock boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_products jsonb;
  v_product_idx integer;
  v_variant_idx integer;
  v_product jsonb;
  v_variant jsonb;
  v_stock integer;
BEGIN
  IF p_product_id IS NULL OR length(p_product_id) > 100
     OR p_stock < 0 OR p_stock > 1000000 THEN
    RAISE EXCEPTION 'Invalid inventory update' USING ERRCODE = '22023';
  END IF;
  IF p_stock IS NULL AND p_in_stock IS NULL THEN
    RAISE EXCEPTION 'No inventory changes supplied' USING ERRCODE = '22023';
  END IF;

  SELECT value INTO v_products
  FROM public.store_data
  WHERE key = 'products'
  FOR UPDATE;

  IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' THEN
    RAISE EXCEPTION 'Product catalog not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT (ordinality - 1)::integer INTO v_product_idx
  FROM jsonb_array_elements(v_products) WITH ORDINALITY AS p(item, ordinality)
  WHERE item->>'id' = p_product_id;

  IF v_product_idx IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0001';
  END IF;

  v_product := v_products->v_product_idx;
  IF p_variant_id IS NOT NULL THEN
    IF v_product->>'hasVariants' <> 'true' THEN
      RAISE EXCEPTION 'Product has no variants' USING ERRCODE = 'P0001';
    END IF;
    SELECT (ordinality - 1)::integer INTO v_variant_idx
    FROM jsonb_array_elements(v_product->'variants') WITH ORDINALITY AS v(item, ordinality)
    WHERE item->>'id' = p_variant_id;
    IF v_variant_idx IS NULL THEN
      RAISE EXCEPTION 'Variant not found' USING ERRCODE = 'P0001';
    END IF;
    v_variant := v_product->'variants'->v_variant_idx;
    v_stock := COALESCE((v_variant->>'stock')::integer, 0);
    IF p_stock IS NOT NULL THEN
      v_variant := jsonb_set(v_variant, '{stock}', to_jsonb(p_stock), true);
    END IF;
    IF p_in_stock IS NOT NULL THEN
      v_variant := jsonb_set(v_variant, '{inStock}', to_jsonb(p_in_stock), true);
    END IF;
    v_product := jsonb_set(v_product, ARRAY['variants', v_variant_idx::text], v_variant, true);
  ELSE
    v_stock := COALESCE((v_product->>'stock')::integer, 0);
    IF p_stock IS NOT NULL THEN
      v_product := jsonb_set(v_product, '{stock}', to_jsonb(p_stock), true);
    END IF;
    IF p_in_stock IS NOT NULL THEN
      v_product := jsonb_set(v_product, '{inStock}', to_jsonb(p_in_stock), true);
    END IF;
  END IF;

  v_products := jsonb_set(v_products, ARRAY[v_product_idx::text], v_product, true);
  UPDATE public.store_data SET value = v_products WHERE key = 'products';

  RETURN jsonb_build_object(
    'productId', p_product_id,
    'variantId', p_variant_id,
    'stock', CASE WHEN p_stock IS NOT NULL THEN p_stock ELSE v_stock END,
    'inStock', CASE
      WHEN p_in_stock IS NOT NULL THEN p_in_stock
      WHEN p_variant_id IS NOT NULL THEN COALESCE((v_variant->>'inStock')::boolean, true)
      ELSE COALESCE((v_product->>'inStock')::boolean, true)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.place_store_order(p_order jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_products jsonb;
  v_items jsonb;
  v_item jsonb;
  v_product jsonb;
  v_variant jsonb;
  v_product_idx integer;
  v_variant_idx integer;
  v_product_id text;
  v_variant_id text;
  v_quantity integer;
  v_stock integer;
  v_i integer;
BEGIN
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object'
     OR jsonb_typeof(p_order->'items') <> 'array' THEN
    RAISE EXCEPTION 'Invalid order payload' USING ERRCODE = '22023';
  END IF;

  -- The single catalog row is locked until the order insert completes.
  -- Every checkout and admin stock edit serializes on this same row.
  SELECT value INTO v_products
  FROM public.store_data
  WHERE key = 'products'
  FOR UPDATE;

  IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' THEN
    RAISE EXCEPTION 'Product catalog not found' USING ERRCODE = 'P0001';
  END IF;

  v_items := p_order->'items';
  FOR v_i IN 0 .. jsonb_array_length(v_items) - 1 LOOP
    v_item := v_items->v_i;
    v_product_id := v_item->>'id';
    v_variant_id := v_item->>'variantId';
    v_quantity := (v_item->>'quantity')::integer;

    SELECT (ordinality - 1)::integer INTO v_product_idx
    FROM jsonb_array_elements(v_products) WITH ORDINALITY AS p(item, ordinality)
    WHERE item->>'id' = v_product_id;
    IF v_product_idx IS NULL THEN
      RAISE EXCEPTION 'Product is no longer available' USING ERRCODE = 'P0001';
    END IF;

    v_product := v_products->v_product_idx;
    IF COALESCE((v_product->>'inStock')::boolean, true) IS NOT TRUE THEN
      RAISE EXCEPTION 'Product is marked unavailable' USING ERRCODE = 'P0001';
    END IF;

    IF v_variant_id IS NOT NULL THEN
      SELECT (ordinality - 1)::integer INTO v_variant_idx
      FROM jsonb_array_elements(v_product->'variants') WITH ORDINALITY AS v(item, ordinality)
      WHERE item->>'id' = v_variant_id;
      IF v_variant_idx IS NULL THEN
        RAISE EXCEPTION 'Variant is no longer available' USING ERRCODE = 'P0001';
      END IF;
      v_variant := v_product->'variants'->v_variant_idx;
      v_stock := COALESCE((v_variant->>'stock')::integer, 0);
      IF COALESCE((v_variant->>'inStock')::boolean, true) IS NOT TRUE OR v_stock < v_quantity THEN
        RAISE EXCEPTION 'Insufficient variant stock' USING ERRCODE = 'P0001';
      END IF;
      v_variant := jsonb_set(v_variant, '{stock}', to_jsonb(v_stock - v_quantity), true);
      v_product := jsonb_set(v_product, ARRAY['variants', v_variant_idx::text], v_variant, true);
    ELSE
      IF COALESCE((v_product->>'hasVariants')::boolean, false) THEN
        RAISE EXCEPTION 'A variant must be selected' USING ERRCODE = 'P0001';
      END IF;
      v_stock := COALESCE((v_product->>'stock')::integer, 0);
      IF v_stock < v_quantity THEN
        RAISE EXCEPTION 'Insufficient product stock' USING ERRCODE = 'P0001';
      END IF;
      v_product := jsonb_set(v_product, '{stock}', to_jsonb(v_stock - v_quantity), true);
    END IF;

    v_products := jsonb_set(v_products, ARRAY[v_product_idx::text], v_product, true);
  END LOOP;

  UPDATE public.store_data SET value = v_products WHERE key = 'products';

  INSERT INTO public.store_orders (id, "createdAt", status, customer, items, total)
  VALUES (
    p_order->>'id',
    p_order->>'createdAt',
    COALESCE(p_order->>'status', 'New'),
    p_order->'customer',
    v_items,
    (p_order->>'total')::numeric
  );

  RETURN p_order;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_save_products(p_products jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_products jsonb;
  v_product jsonb;
  v_old_product jsonb;
  v_result jsonb;
  v_variant jsonb;
  v_old_variant jsonb;
  v_product_idx integer;
  v_variant_idx integer;
  v_old_variant_idx integer;
  v_old_product_idx integer;
BEGIN
  IF p_products IS NULL OR jsonb_typeof(p_products) <> 'array'
     OR jsonb_array_length(p_products) > 500 THEN
    RAISE EXCEPTION 'Invalid product catalog' USING ERRCODE = '22023';
  END IF;

  SELECT value INTO v_old_products
  FROM public.store_data
  WHERE key = 'products'
  FOR UPDATE;

  IF v_old_products IS NULL OR jsonb_typeof(v_old_products) <> 'array' THEN
    v_old_products := '[]'::jsonb;
  END IF;

  v_result := p_products;
  FOR v_product_idx IN 0 .. jsonb_array_length(v_result) - 1 LOOP
    v_product := v_result->v_product_idx;
    SELECT (ordinality - 1)::integer INTO v_old_product_idx
    FROM jsonb_array_elements(v_old_products) WITH ORDINALITY AS p(item, ordinality)
    WHERE item->>'id' = v_product->>'id';

    IF v_old_product_idx IS NOT NULL THEN
      v_old_product := v_old_products->v_old_product_idx;
      v_product := jsonb_set(v_product, '{stock}', COALESCE(v_old_product->'stock', '0'::jsonb), true);
      v_product := jsonb_set(v_product, '{inStock}', COALESCE(v_old_product->'inStock', 'true'::jsonb), true);

      IF v_product->>'hasVariants' = 'true' AND v_old_product->>'hasVariants' = 'true' THEN
        FOR v_variant_idx IN 0 .. jsonb_array_length(v_product->'variants') - 1 LOOP
          v_variant := v_product->'variants'->v_variant_idx;
          SELECT (ordinality - 1)::integer INTO v_old_variant_idx
          FROM jsonb_array_elements(v_old_product->'variants') WITH ORDINALITY AS v(item, ordinality)
          WHERE item->>'id' = v_variant->>'id';
          IF v_old_variant_idx IS NOT NULL THEN
            v_old_variant := v_old_product->'variants'->v_old_variant_idx;
            v_variant := jsonb_set(v_variant, '{stock}', COALESCE(v_old_variant->'stock', '0'::jsonb), true);
            v_variant := jsonb_set(v_variant, '{inStock}', COALESCE(v_old_variant->'inStock', 'true'::jsonb), true);
            v_product := jsonb_set(v_product, ARRAY['variants', v_variant_idx::text], v_variant, true);
          END IF;
          v_old_variant_idx := NULL;
        END LOOP;
      END IF;
      v_old_product_idx := NULL;
      v_result := jsonb_set(v_result, ARRAY[v_product_idx::text], v_product, true);
    END IF;
  END LOOP;

  INSERT INTO public.store_data (key, value)
  VALUES ('products', v_result)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RETURN v_result;
END;
$$;

-- These functions are intended to be called only by the trusted server API,
-- which authenticates the admin and holds the Supabase service-role key.
REVOKE ALL ON FUNCTION public.admin_adjust_inventory(text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_save_products(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_store_order(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_inventory(text, text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_products(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.place_store_order(jsonb) TO service_role;
