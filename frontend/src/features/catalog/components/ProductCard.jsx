import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Eye, Plus } from 'lucide-react';
import { ease } from '../../../shared/motion.js';
import { formatPrice } from '../model.js';

const ProductCard = forwardRef(function ProductCard({ product, index, onQuickView, onAdd }, ref) {
  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: 32, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.25 } }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.7, ease, delay: (index % 4) * 0.06, layout: { type: 'spring', stiffness: 300, damping: 32 } }}
      className="group"
    >
      <div className="relative overflow-hidden rounded-[1.75rem] bg-stone ring-1 ring-inset ring-black/[0.03] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-1.5 group-hover:shadow-lift">
        <button
          type="button"
          onClick={() => onQuickView(product)}
          aria-label={`Quick view ${product.name}`}
          className="focus-ring block w-full rounded-[1.75rem]"
        >
          <img
            src={product.image}
            alt={`${product.name} ${product.category || ""}` }
            loading="lazy"
            className="aspect-[4/5] w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.045] dark:brightness-[.9]"
          />
        </button>

        {/* glass highlight sweep + inner rim */}
        <span aria-hidden className="sheen pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100" />
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-1 ring-inset ring-white/0 transition duration-500 group-hover:ring-white/50 dark:group-hover:ring-white/15" />

        {product.tag && (
          <span className="glass pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium">
            {product.tag}
          </span>
        )}

        <div className="absolute inset-x-3 bottom-3 flex gap-2 transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] md:translate-y-4 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onQuickView(product)}
            className="glass focus-ring flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium transition hover:bg-surface/60"
          >
            <Eye className="h-4 w-4" strokeWidth={1.8} /> Quick View
          </button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => onAdd(product)}
            aria-label={`Add ${product.name} to bag`}
            className="glass-dark focus-ring flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add
          </motion.button>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium tracking-[-0.01em]">{product.name}</h3>
          <p className="mt-0.5 text-sm text-mute">{product.category}</p>
        </div>
        <p className="text-[15px] tabular-nums">{formatPrice(product.price)}</p>
      </div>
    </motion.li>
  );
});

export default ProductCard;
