import { AnimatePresence } from 'framer-motion';
import ProductCard from './ProductCard.jsx';
export default function ProductGrid({ products, onQuickView, onAdd }) {
  if (!products.length) return <p className="py-24 text-center text-mute">Nothing here yet — try another category.</p>;
  return <ul className="grid grid-cols-1 gap-x-6 gap-y-12 min-[480px]:grid-cols-2 lg:grid-cols-4"><AnimatePresence mode="popLayout">{products.map((product, index) => <ProductCard key={product.id} product={product} index={index} onQuickView={onQuickView} onAdd={onAdd} />)}</AnimatePresence></ul>;
}
