import { memo } from 'react';
import { Eye, Plus, Heart } from 'lucide-react';
import { formatPrice } from '../model.js';
import ProductImage from './ProductImage.jsx';

function ProductCard({ product, onQuickView, onAdd, addEnabled, isWishlisted, onToggleWishlist }) {
  return (
    <li className="group product-grid__item">
      <div className="product-grid__surface relative overflow-hidden rounded-[1.75rem] bg-stone ring-1 ring-inset ring-black/[0.03] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-1.5 group-hover:shadow-lift">
        <button
          type="button"
          onClick={() => onQuickView(product)}
          aria-label={`Quick view ${product.name}`}
          className="focus-ring block w-full rounded-[1.75rem]"
        >
          <ProductImage
            src={product.image}
            alt={`${product.name} ${product.category || ''}`}
          />
        </button>

        {/* glass highlight sweep + inner rim */}
        <span aria-hidden className="sheen pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100" />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-1 ring-inset ring-white/0 transition duration-500 group-hover:ring-white/50 dark:group-hover:ring-white/15" />

        {!product.inStock && (
          <span className="pointer-events-none absolute right-3 top-14 rounded-full bg-black/75 px-3 py-1.5 text-[11px] font-medium text-white">Sold out</span>
        )}
        <button
          type="button"
          onClick={() => onToggleWishlist?.(product)}
          aria-label={`${isWishlisted ? 'Remove' : 'Add'} ${product.name} ${isWishlisted ? 'from' : 'to'} wishlist`}
          aria-pressed={Boolean(isWishlisted)}
          className="glass focus-ring absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full transition hover:scale-105"
        >
          <Heart className={`h-[18px] w-[18px] ${isWishlisted ? 'fill-accent text-accent' : 'text-ink'}`} strokeWidth={1.8} />
        </button>
        {product.tag && (
          <span className="glass pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium">
            {product.tag}
          </span>
        )}

        <div className="absolute inset-x-3 bottom-3 flex gap-2 transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] md:translate-y-4 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onQuickView(product)}
            className="product-grid__action glass focus-ring flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium transition hover:bg-surface/60"
          >
            <Eye className="h-4 w-4" strokeWidth={1.8} /> Quick View
          </button>
          <button
            type="button"
            onClick={() => { if (addEnabled) onAdd(product); }}
            aria-label={addEnabled ? `Add ${product.name} to bag` : `${product.name} out of stock`}
            disabled={!addEnabled}
            className="product-grid__action glass-dark focus-ring flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> {addEnabled ? 'Add' : 'Out of stock'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium tracking-[-0.01em]">{product.name}</h3>
          <p className="mt-0.5 text-sm text-mute">{product.category}</p>
        </div>
        <p className="text-[15px] tabular-nums">{formatPrice(product.price)}</p>
      </div>
    </li>
  );
}

export default memo(ProductCard);
