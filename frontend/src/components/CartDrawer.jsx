import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import Drawer from './Drawer.jsx';
import Stepper from './Stepper.jsx';
import GlassButton from './GlassButton.jsx';
import { formatPrice } from '../data.js';
import { submitOrder } from '../services/api.js';

const emptyForm = { name: '', phone: '', email: '', telegram: '', address: '', notes: '' };
export default function CartDrawer({ open, onClose, cart, dispatch }) {
  const [step, setStep] = useState('cart');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0), [cart]);
  useEffect(() => { if (!open) { const timer = setTimeout(() => { setStep('cart'); setError(''); if (result) { setResult(null); setForm(emptyForm); } }, 350); return () => clearTimeout(timer); } }, [open, result]);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const placeOrder = async () => {
    setError('');
    if (!form.name.trim() || !form.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) { setError('Enter your name, phone number, and a valid email address.'); return; }
    setBusy(true);
    try {
      const response = await submitOrder({ customer: { ...form, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), telegram: form.telegram.trim(), address: form.address.trim() || 'Not provided (Online / Self-Pickup)', notes: form.notes.trim() }, items: cart.map((line) => ({ id: line.id, variantId: line.variantId || undefined, quantity: line.qty })) });
      setResult(response); dispatch({ type: 'clear' }); setStep('done');
    } catch (err) { setError(err.message || 'Could not place your order. Please try again.'); }
    finally { setBusy(false); }
  };
  const footer = step === 'cart' && cart.length ? <div className="space-y-4"><div className="flex justify-between text-base font-medium"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div><GlassButton className="w-full" onClick={() => setStep('details')}>Continue to checkout</GlassButton></div> : step === 'details' ? <GlassButton className="w-full" onClick={placeOrder} disabled={busy}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending order…</> : `Place order · ${formatPrice(subtotal)}`}</GlassButton> : step === 'done' ? <GlassButton className="w-full" onClick={onClose}>Continue shopping</GlassButton> : null;
  return <Drawer open={open} onClose={onClose} title={step === 'cart' ? 'Your bag' : step === 'details' ? 'Checkout' : 'Order received'} onBack={step === 'details' && !busy ? () => { setStep('cart'); setError(''); } : null} footer={footer}>
    <AnimatePresence mode="wait" initial={false}>
      {step === 'cart' && <motion.div key="cart" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-4 py-2 sm:px-5">{!cart.length ? <div className="flex flex-col items-center py-20 text-center"><ShoppingBag className="mb-5 h-8 w-8 text-mute" /><p className="text-lg font-medium">Your bag is empty</p><p className="mt-1 text-sm text-mute">Add a product to get started.</p></div> : cart.map((line) => <div key={line.key} className="flex gap-4 border-b border-ink/[.06] py-4"><img src={line.product.image} alt="" className="h-24 w-20 rounded-2xl bg-stone object-contain" /><div className="flex min-w-0 flex-1 flex-col"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium">{line.product.name}</p><p className="text-xs text-mute">{line.variant ? [line.variant.size, line.variant.color, line.variant.type].filter(Boolean).join(' / ') : 'Standard'}</p></div><p className="text-sm">{formatPrice(line.unitPrice * line.qty)}</p></div><div className="mt-auto flex items-center justify-between pt-3"><Stepper compact value={line.qty} onChange={(qty) => dispatch({ type: 'qty', key: line.key, qty })} /><button type="button" onClick={() => dispatch({ type: 'remove', key: line.key })} aria-label="Remove item" className="grid h-8 w-8 place-items-center rounded-full text-mute hover:text-accent"><Trash2 className="h-4 w-4" /></button></div></div></div>)}</motion.div>}
      {step === 'details' && <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 p-4 sm:p-5"><p className="text-sm text-mute">Pay on delivery. We’ll confirm your order with you.</p>{[['name','Full name','text'],['phone','Phone number','tel'],['email','Email address','email'],['telegram','Telegram username (optional)','text'],['address','Delivery address (optional)','text'],['notes','Order notes (optional)','text']].map(([key,label,type]) => <label key={key} className="block text-xs font-medium text-charcoal/70">{label}<input type={type} value={form[key]} onChange={update(key)} autoComplete={key === 'name' ? 'name' : key === 'phone' ? 'tel' : key === 'email' ? 'email' : 'off'} className="mt-1.5 h-11 w-full rounded-xl border border-ink/10 bg-surface/70 px-3.5 text-sm outline-none focus:border-ink/30" /></label>)}{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<p className="text-xs text-mute">Your order total is calculated and validated securely by Strawping’s server using the current catalog and selected variants.</p></motion.div>}
      {step === 'done' && <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-8 py-16 text-center"><CheckCircle2 className="mb-5 h-12 w-12 text-green-600" /><p className="text-2xl font-semibold">Thank you, {form.name.split(' ')[0]}.</p><p className="mt-2 text-sm text-mute">Order #{result?.order?.id || result?.id || 'received'}</p><p className="mt-5 text-sm leading-relaxed text-charcoal/70">{result?.telegramSent ? 'Your order was received and the store owner was notified.' : 'Your order was received. The store owner may contact you to confirm the details.'}</p></motion.div>}
    </AnimatePresence>
  </Drawer>;
}
