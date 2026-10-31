-- store_data already stores products as JSONB; this migration backfills the
-- normalized gallery and thumbnail keys while retaining the legacy `image` key.
update public.store_data
set value = (
  select coalesce(jsonb_agg(
    case when jsonb_typeof(product) = 'object' then
      product || jsonb_build_object(
        'images', case
          when jsonb_typeof(product->'images') = 'array' then product->'images'
          when nullif(product->>'image','') is not null then jsonb_build_array(product->>'image')
          else '[]'::jsonb end,
        'thumbnail', coalesce(nullif(product->>'thumbnail',''), nullif(product->>'image',''))
      )
    else product end
  ), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(value)='array' then value else '[]'::jsonb end) as items(product)
), updated_at = now()
where key = 'products';

-- Supabase Storage accepts the formats optimized by the admin uploader.
update storage.buckets
set allowed_mime_types = array['image/jpeg']::text[]
where id = 'product-images';
