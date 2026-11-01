export const FREE_SHIPPING_THRESHOLD = 0;
export const FLAT_SHIPPING = 0;
export const formatPrice = (value, currency = '$') => `${currency}${Number(value || 0).toFixed(2)}`;
export function mapProduct(raw) {
  const images = Array.isArray(raw.images) ? raw.images.filter(Boolean) : [];
  const image = raw.thumbnail || raw.image || images[0] || 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=80';
  const variants = Array.isArray(raw.variants) ? raw.variants.map((variant) => ({
    ...variant,
    inStock: variant.inStock !== false,
    stock: Math.max(0, Number(variant.stock) || 0),
  })) : [];
  const fields = ['size', 'color', 'type'];
  const variantFields = fields.filter((field) => variants.some((v) => v[field]));
  const hasVariants = raw.hasVariants === true;
  const stock = Math.max(0, Number(raw.stock) || 0);
  const enabled = raw.inStock !== false;
  const hasSellableVariant = variants.some((variant) => variant.inStock && variant.stock > 0);
  return {
    ...raw,
    type: raw.category || 'Product',
    image,
    images: [...new Set([image, ...images].filter(Boolean))],
    hasVariants,
    variants,
    variantFields,
    sizes: variants.map((v) => fields.map((f) => v[f]).filter(Boolean).join(' / ')).filter(Boolean),
    stock,
    inStock: enabled && (hasVariants ? hasSellableVariant : stock > 0),
  };
}
export const defaultVariant = (product) => product?.variants?.find((v) => v.inStock && Number(v.stock) > 0) || null;
export const variantPrice = (product, variant) => Number(product.price || 0) + Number(variant?.priceAdjustment || 0);
