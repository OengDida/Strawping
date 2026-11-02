import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import Drawer from '../../../shared/components/Drawer.jsx';
import Stepper from '../../../shared/components/Stepper.jsx';
import GlassButton from '../../../shared/components/GlassButton.jsx';
import { formatPrice } from '../../catalog/model.js';
import { submitOrder } from '../../../shared/services/api.js';

const emptyForm = { name: '', phone: '', email: '', telegram: '', address: '', notes: '' };
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export default function CartDrawer({ open, onClose, cart, dispatch, user, session, profile, cartLoading = false, cartLoadError = '' }) {
  const [step, setStep] = useState('cart');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0), [cart]);
  const accountName = profile?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';

  useEffect(() => {
    if (open && user) {
      setForm((current) => ({ ...current, name: accountName, email: user.email || '' }));
    }
  }, [open, user?.id, profile?.display_name]);
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStep('cart');
        setError('');
        if (result) { setResult(null); setForm(emptyForm); }
      }, 350);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, result]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const placeOrder = async () => {
    setError('');
    const email = form.email.trim();
    if (!form.name.trim() || !form.phone.trim() || (email && !isValidEmail(email)) || (!user && !isValidEmail(email))) {
      setError(user
        ? 'Enter your name and phone number. If you provide an email, make sure it is valid.'
        : 'Enter your name, phone number, and a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const response = await submitOrder({
        customer: {
          ...form,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email,
          telegram: form.telegram.trim(),
          address: form.address.trim() || 'Not provided (Online / Self-Pickup)',
          notes: form.notes.trim(),
        },
        items: cart.map((line) => ({ id: line.id, variantId: line.variantId || undefined, quantity: line.qty })),
      }, session?.access_token);
      setResult(response);
      dispatch({ type: 'clear' });
      setStep('done');
    } catch (err) { setError(err.message || 'Could not place your order. Please try again.'); }
    finally { setBusy(false); }
  };

  const footer = step === 'cart' && cart.length ? (
    <div className="space-y-4"><div className="flex justify-between text-base font-medium"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div><GlassButton className="w-full" onClick={() => setStep('details')}>Continue to checkout</GlassButton></div>
  ) : step === 'details' ? (
    <GlassButton className="w-full" onClick={placeOrder} disabled={busy}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending order…</> : `Place order · ${formatPrice(subtotal)}`}</GlassButton>
  ) : step === 'done' ? <GlassButton className="w-full" onClick={onClose}>Continue shopping</GlassButton> : null;

  const inputClass = 'mt-1.5 h-11 w-full rounded-xl border border-ink/10 bg-surface/70 px-3.5 text-sm outline-none focus:border-ink/30 read-only:cursor-not-allowed read-only:opacity-70';
  return (
    <Drawer open={open} onClose={onClose} title={step === 'cart' ? 'Your bag' : step === 'details' ? 'Checkout' : 'Order received'} onBack={step === 'details' && !busy ? () => { setStep('cart'); setError(''); } : null} footer={footer}>
      <AnimatePresence mode="wait" initial={false}>
        {step === 'cart' && <motion.div key="cart" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="px-4 py-2 sm:px-5">
          {cartLoading
            ? <div role="status" className="flex flex-col items-center py-20 text-center"><Loader2 className="mb-4 h-7 w-7 animate-spin text-mute" /><p className="text-sm text-mute">Loading your saved cart…</p></div>
            : cartLoadError
              ? <div role="alert" className="py-20 text-center"><p className="text-sm font-medium">Could not load your saved cart.</p><p className="mt-1 text-sm text-mute">Refresh the page and try again.</p></div>
              : !cart.length
                ? <div className="flex flex-col items-center py-20 text-center"><ShoppingBag className="mb-5 h-8 w-8 text-mute" /><p className="text-lg font-medium">Your bag is empty</p><p className="mt-1 text-sm text-mute">Add a product to get started.</p></div>
                : cart.map((line) => <div key={line.key} className="flex gap-4 border-b border-ink/[.06] py-4"><img src={line.product.image} alt="" className="h-24 w-20 rounded-2xl bg-stone object-contain" /><div className="flex min-w-0 flex-1 flex-col"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium">{line.product.name}</p><p className="text-xs text-mute">{line.variant ? [line.variant.size, line.variant.color, line.variant.type].filter(Boolean).join(' / ') : 'Standard'}</p></div><p className="text-sm">{formatPrice(line.unitPrice * line.qty)}</p></div><div className="mt-auto flex items-center justify-between pt-3"><Stepper compact max={Math.max(1, line.maxQty)} value={Math.min(line.qty, Math.max(1, line.maxQty))} onChange={(qty) => dispatch({ type: 'qty', key: line.key, qty, maxQty: line.maxQty })} /><button type="button" onClick={() => dispatch({ type: 'remove', key: line.key })} aria-label="Remove item" className="grid h-8 w-8 place-items-center rounded-full text-mute hover:text-accent"><Trash2 className="h-4 w-4" /></button></div></div></div>)}
        </motion.div>}
        {step === 'details' && <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 p-4 sm:p-5">
          <p className="text-sm text-mute">Pay on delivery. We’ll confirm your order with you.</p>
          <label className="block text-xs font-medium text-charcoal/70">Full name<input type="text" value={form.name} readOnly={Boolean(user)} required autoComplete="name" onChange={update('name')} className={inputClass} /></label>
          <label className="block text-xs font-medium text-charcoal/70">Phone number<input type="tel" value={form.phone} required autoComplete="tel" onChange={update('phone')} className={inputClass} /></label>
          <label className="block text-xs font-medium text-charcoal/70">Email address{user ? ' (optional)' : ''}<input type="email" value={form.email} required={!user} autoComplete="email" onChange={update('email')} className={inputClass} /></label>
          {user && <p className="-mt-2 text-[11px] text-mute">Your account name is used for this order. Update it in account settings if needed.</p>}
          <label className="block text-xs font-medium text-charcoal/70">Telegram username (optional)<input type="text" value={form.telegram} autoComplete="off" onChange={update('telegram')} className={inputClass} /></label>
          <label className="block text-xs font-medium text-charcoal/70">Delivery address (optional)<input type="text" value={form.address} autoComplete="street-address" onChange={update('address')} className={inputClass} /></label>
          <label className="block text-xs font-medium text-charcoal/70">Order notes (optional)<input type="text" value={form.notes} autoComplete="off" onChange={update('notes')} className={inputClass} /></label>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <p className="text-xs text-mute">Your order total is calculated and validated securely by Strawping’s server using the current catalog and selected variants.</p>
        </motion.div>}
        {step === 'done' && <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-8 py-16 text-center"><CheckCircle2 className="mb-5 h-12 w-12 text-green-600" /><p className="text-2xl font-semibold">Thank you, {form.name.split(' ')[0]}.</p><p className="mt-2 text-sm text-mute">Order #{result?.order?.id || result?.id || 'received'}</p><p className="mt-5 text-sm leading-relaxed text-charcoal/70">{result?.telegramSent ? 'Your order was received and the store owner was notified.' : 'Your order was received. The store owner may contact you to confirm the details.'}</p></motion.div>}
      </AnimatePresence>
    </Drawer>
  );
}
