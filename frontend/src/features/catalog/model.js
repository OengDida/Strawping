export const FREE_SHIPPING_THRESHOLD = 0;
export const FLAT_SHIPPING = 0;
export const formatPrice = (value, currency = '$') => `${currency}${Number(value || 0).toFixed(2)}`;
export function mapProduct(raw) {
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  const image = raw.thumbnail || raw.image || images[0] || 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=80';
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const fields = ['size', 'color', 'type'];
  const variantFields = fields.filter((field) => variants.some((v) => v[field]));
  return {
    ...raw,
    type: raw.category || 'Product',
    image,
    images: [...new Set([image, ...images].filter(Boolean))],
    hasVariants: raw.hasVariants === true,
    variants,
    variantFields,
    sizes: variants.map((v) => fields.map((f) => v[f]).filter(Boolean).join(' / ')).filter(Boolean),
    inStock: raw.inStock === true,
  };
}
export const defaultVariant = (product) => product?.variants?.find((v) => Number(v.stock) > 0) || null;
export const variantPrice = (product, variant) => Number(product.price || 0) + Number(variant?.priceAdjustment || 0);
