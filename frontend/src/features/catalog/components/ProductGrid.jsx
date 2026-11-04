import ProductCard from './ProductCard.jsx';

export default function ProductGrid({
  products,
  loading = false,
  onQuickView,
  onAdd,
  canAdd,
  wishlistIds = [],
  onToggleWishlist,
}) {
  if (loading && products.length === 0) {
    return (
      <ul
        aria-label="Loading products"
        aria-busy="true"
        className="grid grid-cols-1 gap-x-6 gap-y-12 min-[480px]:grid-cols-2 lg:grid-cols-4"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="animate-pulse">
            <div className="aspect-[4/5] rounded-[1.75rem] bg-ink/[.05]" />
            <div className="mt-4 h-4 w-3/4 rounded bg-ink/[.06]" />
            <div className="mt-2 h-3 w-1/3 rounded bg-ink/[.05]" />
          </li>
        ))}
      </ul>
    );
  }

  if (!products.length) {
    return <p className="py-24 text-center text-mute">No products are available yet. Add products through the admin panel.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-12 min-[480px]:grid-cols-2 lg:grid-cols-4">
      {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            index={index}
            onQuickView={onQuickView}
            onAdd={onAdd}
            canAdd={canAdd}
            isWishlisted={wishlistIds.includes(product.id)}
            onToggleWishlist={onToggleWishlist}
          />
      ))}
    </ul>
  );
}
