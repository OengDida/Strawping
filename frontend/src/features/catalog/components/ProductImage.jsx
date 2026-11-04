import { useEffect, useRef, useState } from 'react';
import { getResponsiveImageSources } from '../imageSources.js';

export default function ProductImage({
  src,
  alt,
  priority = false,
  sizes = '(max-width: 479px) 92vw, (max-width: 1023px) 46vw, 25vw',
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fallbackAttempted = useRef(false);
  const { src: optimizedSrc, srcSet } = getResponsiveImageSources(src, {
    widths: [320, 480, 640, 960],
    aspectRatio: 4 / 5,
    quality: 75,
    fallbackWidth: 480,
  });

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
          srcSet={srcSet}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          sizes={sizes}
          width="480"
          height="600"
          onLoad={() => setLoaded(true)}
          onError={(event) => {
            if (optimizedSrc !== src && !fallbackAttempted.current) {
              fallbackAttempted.current = true;
              event.currentTarget.removeAttribute('srcset');
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
