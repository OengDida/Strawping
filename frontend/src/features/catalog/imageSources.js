const SUPABASE_OBJECT_PATH = '/storage/v1/object/public/';
const SUPABASE_RENDER_PATH = '/storage/v1/render/image/public/';

function transformedImageUrl(source, width, height, quality) {
  try {
    const url = new URL(source);
    const isSupabaseStorage =
      url.pathname.includes(SUPABASE_OBJECT_PATH) ||
      url.pathname.includes(SUPABASE_RENDER_PATH);
    const isUnsplash = url.hostname === 'images.unsplash.com';

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!isSupabaseStorage && !isUnsplash) return null;

    if (url.pathname.includes(SUPABASE_OBJECT_PATH)) {
      url.pathname = url.pathname.replace(SUPABASE_OBJECT_PATH, SUPABASE_RENDER_PATH);
      url.searchParams.set('height', String(height));
      url.searchParams.set('resize', 'cover');
    } else {
      url.searchParams.set('auto', 'format');
      url.searchParams.set('fit', 'crop');
      url.searchParams.set('w', String(width));
      url.searchParams.set('q', String(quality));
    }

    if (isSupabaseStorage) {
      url.searchParams.set('width', String(width));
      url.searchParams.set('quality', String(quality));
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Build responsive candidates for supported image hosts. Supabase Storage
 * negotiates modern formats from the request's Accept header; Unsplash uses
 * auto=format. Unknown hosts stay untouched rather than receiving invalid
 * transformation parameters.
 */
export function getResponsiveImageSources(
  source,
  {
    widths = [320, 480, 640, 960],
    aspectRatio = 4 / 5,
    quality = 75,
    fallbackWidth = 480,
  } = {},
) {
  if (!source) return { src: '', srcSet: undefined };

  const candidates = widths
    .map((width) => {
      const height = Math.round(width / aspectRatio);
      const url = transformedImageUrl(source, width, height, quality);
      return url ? `${url} ${width}w` : null;
    })
    .filter(Boolean);

  const fallbackHeight = Math.round(fallbackWidth / aspectRatio);
  const src =
    transformedImageUrl(source, fallbackWidth, fallbackHeight, quality) || source;

  return {
    src,
    srcSet: candidates.length ? candidates.join(', ') : undefined,
  };
}