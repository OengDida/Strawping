import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import Stepper from '../../../shared/components/Stepper.jsx';
import { useEscape } from '../../../shared/hooks/index.js';
import { defaultVariant, formatPrice, variantPrice } from '../model.js';

function Body({ product, onClose, onAdd }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [variantId, setVariantId] = useState(defaultVariant(product)?.id || '');
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const images = product.images?.length ? product.images : [product.image].filter(Boolean);
  const variant = product.variants?.find((item) => item.id === variantId) || null;
  const unavailable = product.hasVariants
    ? (!variant || variant.inStock === false || variant.stock < qty)
    : (product.inStock === false || product.stock < qty);
  const fields = product.variantFields || [];
  const add = () => { if (unavailable || !product.inStock) return; onAdd(product, variant, qty); setAdded(true); setTimeout(() => setAdded(false), 1500); };
  return <div className="relative grid md:grid-cols-2" onClick={(event) => event.stopPropagation()}>
    <button type="button" onClick={onClose} aria-label="Close product details" className="glass focus-ring absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full"><X className="h-4 w-4" /></button>
    <div className="relative bg-stone md:min-h-[600px]">
      {images.length > 0 ? <><motion.img key={images[imageIndex]} initial={{ opacity: .4 }} animate={{ opacity: 1 }} transition={{ duration: .3 }} src={images[imageIndex]} alt={product.name} className="h-[46svh] w-full object-contain md:absolute md:inset-0 md:h-full" />{images.length > 1 && <><button onClick={() => setImageIndex((imageIndex + images.length - 1) % images.length)} aria-label="Previous image" className="glass absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full"><ChevronLeft /></button><button onClick={() => setImageIndex((imageIndex + 1) % images.length)} aria-label="Next image" className="glass absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full"><ChevronRight /></button></>}</> : <div className="grid h-[46svh] place-items-center text-mute md:h-full">No product image</div>}
      {images.length > 1 && <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">{images.map((url, i) => <button key={url + i} onClick={() => setImageIndex(i)} aria-label={`View image ${i + 1}`} className={`h-12 w-12 overflow-hidden rounded-lg border-2 ${i === imageIndex ? 'border-accent' : 'border-white/60'}`}><img src={url} alt="" className="h-full w-full object-cover" /></button>)}</div>}
    </div>
    <div className="flex flex-col p-6 sm:p-10">
      <p className="eyebrow">{product.category}</p><h2 id="qv-title" className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{product.name}</h2>
      <p className="mt-6 text-2xl tabular-nums">{formatPrice(variantPrice(product, variant))}</p>
      <p className="mt-6 whitespace-pre-line leading-relaxed text-charcoal/75">{product.description || 'Contact us for more product details.'}</p>
      {product.hasVariants && <fieldset className="mt-8"><legend className="eyebrow mb-3">Choose {fields.join(' / ') || 'option'}</legend><div className="flex flex-wrap gap-2">{product.variants.map((item) => { const label = fields.map((field) => item[field]).filter(Boolean).join(' / '); const selected = item.id === variantId; return <button key={item.id} type="button" disabled={item.inStock === false || item.stock < 1} aria-pressed={selected} onClick={() => setVariantId(item.id)} className={`focus-ring rounded-full border px-4 py-2 text-sm ${selected ? 'border-ink bg-ink text-white' : 'border-ink/15'} disabled:cursor-not-allowed disabled:opacity-35`}>{label} {item.inStock === false || item.stock < 1 ? '(Sold out)' : ''}</button>; })}</div>{variant && <p className="mt-2 text-xs text-mute">{variant.stock} in stock</p>}</fieldset>}
      <div className="mt-8 flex items-center gap-3"><Stepper value={qty} onChange={setQty} /><motion.button type="button" whileTap={{ scale: .97 }} onClick={add} disabled={unavailable || !product.inStock} className="glass-dark focus-ring flex h-12 min-w-0 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium disabled:opacity-40">{added ? <><Check className="mr-2 h-4 w-4" /> Added to bag</> : unavailable || !product.inStock ? 'Sold out' : `Add to bag · ${formatPrice(variantPrice(product, variant) * qty)}`}</motion.button></div>
    </div>
  </div>;
}
export default function QuickView({ product, onClose, onAdd }) {
  useEscape(Boolean(product), onClose);
  return <AnimatePresence>{product && <motion.div key="quickview" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.button aria-label="Close product details" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-md" /><motion.div role="dialog" aria-modal="true" aria-labelledby="qv-title" initial={{ opacity: 0, y: 48, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} className="glass-panel no-scrollbar relative max-h-[92svh] w-full max-w-5xl overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem]"><Body key={product.id} product={product} onClose={onClose} onAdd={onAdd} /></motion.div></motion.div>}</AnimatePresence>;
}
