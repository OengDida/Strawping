import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import Drawer from '../../../shared/components/Drawer.jsx';
import { formatPrice } from '../../catalog/model.js';

export default function WishlistDrawer({ open, onClose, products, productIds, onRemove, onAdd }) {
  const saved = productIds.map((id) => products.find((product) => product.id === id)).filter(Boolean);
  return (
    <Drawer open={open} onClose={onClose} title={`Wishlist${saved.length ? ` · ${saved.length}` : ''}`}>
      <div className="px-4 py-2 sm:px-5">
        {saved.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <Heart className="mb-5 h-8 w-8 text-mute" />
            <p className="text-lg font-medium">Your wishlist is empty</p>
            <p className="mt-1 text-sm text-mute">Save items you’d like to revisit.</p>
          </div>
        ) : saved.map((product) => (
          <article key={product.id} className="flex gap-4 border-b border-ink/[.06] py-4">
            <img src={product.image} alt="" className="h-24 w-20 rounded-2xl bg-stone object-contain" />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-mute">{product.category}</p>
                  <p className="mt-2 text-sm tabular-nums">{formatPrice(product.price)}</p>
                </div>
                <button type="button" onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name} from wishlist`} className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full text-mute transition hover:bg-surface/70 hover:text-accent">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <button type="button" onClick={() => onAdd(product)} className="focus-ring mt-auto inline-flex items-center gap-2 pt-3 text-left text-xs font-semibold text-ink hover:text-accent">
                <ShoppingBag className="h-4 w-4" /> Add to bag
              </button>
            </div>
          </article>
        ))}
      </div>
    </Drawer>
  );
}
