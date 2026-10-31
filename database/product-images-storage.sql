-- Run once in the Supabase SQL Editor to enable product image uploads.
-- Images are public for storefront display; upload access stays server-side
-- through the existing Supabase service-role API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 1500000, array['image/jpeg']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;