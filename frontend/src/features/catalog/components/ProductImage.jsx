import { useEffect, useRef, useState } from 'react';

function storageRenderUrl(source, width, height, quality) {
  if (!source) return null;

  try {
    const url = new URL(source);
    const objectPath = '/storage/v1/object/public/';
    if (!url.pathname.includes(objectPath)) return null;

    url.pathname = url.pathname.replace(
      objectPath,
      '/storage/v1/render/image/public/',
    );
    url.searchParams.set('width', String(width));
    url.searchParams.set('height', String(height));
    url.searchParams.set('quality', String(quality));
    url.searchParams.set('resize', 'cover');
    return url.toString();
  } catch {
    return null;
  }
}

export default function ProductImage({ src, alt, priority = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fallbackAttempted = useRef(false);

  const optimizedSrc = storageRenderUrl(src, 480, 600, 80) || src;

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    fallbackAttempted.current = false;
  }, [src, optimizedSrc]);

  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-stone">
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-ink/[.05]"
        />
      )}



      {!failed && src && (
        <img
          src={optimizedSrc}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          sizes="(max-width: 479px) 92vw, (max-width: 1023px) 46vw, 25vw"
          onLoad={() => setLoaded(true)}
          onError={(event) => {
            if (optimizedSrc !== src && !fallbackAttempted.current) {
              fallbackAttempted.current = true;
              event.currentTarget.src = src;
              return;
            }
            setFailed(true);
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-[1.045] dark:brightness-[.9] ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {failed && (
        <div className="absolute inset-0 grid place-items-center text-sm text-mute">
          Image unavailable
        </div>
      )}
    </div>
  );
}
