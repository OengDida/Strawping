import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Clock3, LoaderCircle, Package, X } from 'lucide-react';
import { loadMyOrders, subscribeToMyOrders } from '../accountService.js';
import { formatPrice } from '../../catalog/model.js';
import { useEscape, useScrollLock } from '../../../shared/hooks/index.js';

const FILTERS = [
  { id: 'all', label: 'All Order' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const PENDING_STATUSES = new Set(['pending', 'contacted', 'shipped']);

function statusKey(status) {
  const key = String(status || '').trim().toLowerCase();
  return key === 'new' ? 'pending' : key;
}

function statusPresentation(status) {
  const key = statusKey(status);
  if (key === 'pending') return { label: 'Pending', styles: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' };
  if (key === 'contacted') return { label: 'Contacted', styles: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' };
  if (key === 'shipped') return { label: 'Shipped', styles: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' };
  if (key === 'completed') return { label: 'Delivered', styles: 'bg-green-600/10 text-green-700 dark:text-green-300' };
  if (key === 'cancelled') return { label: 'Cancelled', styles: 'bg-red-500/10 text-red-700 dark:text-red-300' };
  return { label: status || 'Processing', styles: 'bg-ink/[.06] text-charcoal/70 dark:bg-white/10 dark:text-white/75' };
}

function dateLabel(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

function orderItems(order) {
  return Array.isArray(order?.items) ? order.items.filter((item) => item && typeof item === 'object') : [];
}

function quantityTotal(items) {
  return items.reduce((sum, item) => sum + (Number.isInteger(Number(item.quantity)) ? Number(item.quantity) : 0), 0);
}

function OrderDetailsDialog({ order, productById, currency, onClose }) {
  useEscape(Boolean(order), onClose);
  useScrollLock(Boolean(order));
  if (!order) return null;

  const items = orderItems(order);
  const customer = order.customer && typeof order.customer === 'object' ? order.customer : {};
  const status = statusPresentation(order.status);

  return (
    <AnimatePresence>
      {order && <motion.div
        className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/45 px-4 py-8 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-details-title"
          className="glass-panel relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] p-5 shadow-lift sm:p-7"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={onClose} aria-label="Close order details" className="focus-ring absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-surface/70 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
          <p className="eyebrow">Order #{order.id}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 pr-10">
            <h2 id="order-details-title" className="text-2xl font-semibold tracking-[-0.04em]">Order details</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.styles}`}>{status.label}</span>
          </div>
          <p className="mt-2 text-sm text-mute">{dateLabel(order.createdAt)}</p>

          <div className="mt-6 divide-y divide-ink/[.08] rounded-2xl border border-ink/[.08] px-4 dark:divide-white/10 dark:border-white/10">
            {items.map((item, index) => {
              const product = productById.get(item.id);
              const image = item.image || item.thumbnail || product?.image || product?.thumbnail || '';
              const qty = Number(item.quantity) || 0;
              const lineTotal = (Number(item.price) || 0) * qty;
              return <div key={`${item.id || 'item'}-${index}`} className="flex items-center gap-3 py-4">
                {image
                  ? <img src={image} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-stone object-cover" />
                  : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-stone text-mute"><Package className="h-5 w-5" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.name || product?.name || 'Product'}</p>
                  {item.variantLabel && <p className="mt-0.5 text-xs text-mute">{item.variantLabel}</p>}
                  <p className="mt-0.5 text-xs text-mute">Qty: {qty}</p>
                </div>
                <p className="shrink-0 text-sm font-medium">{formatPrice(lineTotal, currency)}</p>
              </div>;
            })}
            {!items.length && <p className="py-5 text-sm text-mute">Item details are unavailable for this order.</p>}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-ink/[.035] p-4 dark:bg-white/[.04]">
              <p className="text-xs font-semibold uppercase tracking-wide text-mute">Delivery details</p>
              <p className="mt-2 text-sm font-medium">{customer.name || 'Customer'}</p>
              {customer.phone && <p className="mt-1 text-sm text-mute">{customer.phone}</p>}
              {customer.email && <p className="mt-1 break-all text-sm text-mute">{customer.email}</p>}
              {customer.address && <p className="mt-2 text-sm text-mute">{customer.address}</p>}
            </div>
            <div className="flex items-end justify-between rounded-2xl bg-ink/[.035] p-4 dark:bg-white/[.04] sm:block sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-mute">Order total</p>
              <p className="mt-2 text-2xl font-semibold">{formatPrice(Number(order.total) || 0, currency)}</p>
            </div>
          </div>
        </motion.section>
      </motion.div>}
    </AnimatePresence>
  );
}

export default function OrderHistoryPage({ user, authLoading, products = [], currency = '$', onSignIn, onBackToShop }) {
  const [orders, setOrders] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [liveUnavailable, setLiveUnavailable] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const refreshOrders = useCallback(async (userId, activeRef) => {
    try {
      const rows = await loadMyOrders(userId);
      if (activeRef.current) {
        setOrders(rows);
        setError('');
      }
    } catch (loadError) {
      if (activeRef.current) setError(loadError.message || 'Could not load your orders. Please try again.');
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!user?.id) {
      setOrders([]);
      setLoading(false);
      return undefined;
    }

    const activeRef = { current: true };
    setLoading(true);
    setError('');
    setLiveUnavailable(false);
    const unsubscribe = subscribeToMyOrders(
      user.id,
      () => { void refreshOrders(user.id, activeRef); },
      () => { if (activeRef.current) setLiveUnavailable(true); },
    );
    void refreshOrders(user.id, activeRef);

    return () => {
      activeRef.current = false;
      unsubscribe();
    };
  }, [authLoading, user?.id, refreshOrders, retryCount]);

  const counts = useMemo(() => ({
    all: orders.length,
    pending: orders.filter((order) => PENDING_STATUSES.has(statusKey(order.status))).length,
    completed: orders.filter((order) => statusKey(order.status) === 'completed').length,
    cancelled: orders.filter((order) => statusKey(order.status) === 'cancelled').length,
  }), [orders]);

  const visibleOrders = useMemo(() => {
    if (activeFilter === 'pending') return orders.filter((order) => PENDING_STATUSES.has(statusKey(order.status)));
    if (activeFilter === 'completed' || activeFilter === 'cancelled') {
      return orders.filter((order) => statusKey(order.status) === activeFilter);
    }
    return orders;
  }, [orders, activeFilter]);

  if (authLoading) {
    return <main className="mx-auto grid min-h-[70vh] max-w-7xl place-items-center px-5 pt-24">
      <LoaderCircle className="h-7 w-7 animate-spin text-mute" aria-label="Loading account" />
    </main>;
  }

  if (!user) {
    return <main className="mx-auto flex min-h-[70vh] max-w-7xl flex-col items-center justify-center px-5 pt-24 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-ink/[.05]"><Package className="h-6 w-6 text-mute" /></div>
      <h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">Sign in to view your orders</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-mute">Order history is private to your account. Sign in to see your purchases and live status updates.</p>
      <button type="button" onClick={onSignIn} className="focus-ring mt-6 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-onsolid transition hover:opacity-90">Sign in</button>
    </main>;
  }

  return <main className="mx-auto min-h-[75vh] max-w-7xl px-5 pb-20 pt-28 sm:pt-32">
    <button type="button" onClick={onBackToShop} className="focus-ring mb-6 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-mute transition hover:bg-ink/[.05] hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Back to shop
    </button>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">Your account</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Order History</h1>
        <p className="mt-2 text-sm text-mute">Track your purchases and see the latest order status.</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-3 py-2 text-xs text-mute dark:border-white/10">
        <Clock3 className="h-3.5 w-3.5" /> Updates appear automatically
      </span>
    </div>

    <div role="tablist" aria-label="Filter orders" className="mt-8 flex gap-2 overflow-x-auto border-b border-ink/[.08] pb-3 dark:border-white/10">
      {FILTERS.map((filter) => <button
        key={filter.id}
        type="button"
        role="tab"
        aria-selected={activeFilter === filter.id}
        onClick={() => setActiveFilter(filter.id)}
        className={`focus-ring inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition ${
          activeFilter === filter.id ? 'bg-ink text-onsolid' : 'bg-ink/[.04] text-charcoal/70 hover:bg-ink/[.08] dark:bg-white/[.05] dark:text-white/70 dark:hover:bg-white/10'
        }`}
      >
        {filter.label}
        <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${activeFilter === filter.id ? 'bg-white/15' : 'bg-paper/70 dark:bg-black/20'}`}>{counts[filter.id]}</span>
      </button>)}
    </div>

    {liveUnavailable && <p role="status" className="mt-4 rounded-xl bg-orange-500/[.08] px-4 py-3 text-xs text-orange-800 dark:text-orange-200">Live updates are unavailable right now. Refresh the page to check for status changes.</p>}
    {error && <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/15 bg-red-500/[.06] px-4 py-3 text-sm text-red-700 dark:text-red-300">
      <span>{error}</span>
      <button type="button" onClick={() => { setLoading(true); setRetryCount((current) => current + 1); }} className="font-semibold underline underline-offset-2">Try again</button>
    </div>}

    <div className="mt-5 overflow-hidden rounded-3xl border border-ink/[.08] bg-surface/60 shadow-sm dark:border-white/10 dark:bg-white/[.025]">
      <div className="grid grid-cols-[minmax(230px,1.6fr)_minmax(125px,.8fr)_minmax(110px,.7fr)_minmax(135px,.8fr)] gap-4 border-b border-ink/[.08] bg-ink/[.025] px-5 py-3 text-[11px] font-semibold uppercase tracking-[.12em] text-mute dark:border-white/10 dark:bg-white/[.025] max-sm:hidden">
        <span>Item</span><span>Status</span><span>Total</span><span>Details</span>
      </div>
      {loading && !orders.length
        ? <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-mute"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading orders…</div>
        : visibleOrders.length
          ? <div className="divide-y divide-ink/[.07] dark:divide-white/[.08]">
            {visibleOrders.map((order) => {
              const items = orderItems(order);
              const first = items[0] || {};
              const product = productById.get(first.id);
              const image = first.image || first.thumbnail || product?.image || product?.thumbnail || '';
              const status = statusPresentation(order.status);
              const qty = quantityTotal(items);
              return <div key={order.id} className="grid grid-cols-[minmax(230px,1.6fr)_minmax(125px,.8fr)_minmax(110px,.7fr)_minmax(135px,.8fr)] items-center gap-4 px-5 py-4 max-sm:grid-cols-1 max-sm:gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {image
                    ? <img src={image} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-stone object-cover" />
                    : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-stone text-mute"><Package className="h-5 w-5" /></div>}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{first.name || product?.name || (items.length ? 'Order item' : 'Order')}</p>
                    {items.length > 1 && <p className="mt-0.5 text-xs text-mute">and {items.length - 1} more {items.length === 2 ? 'item' : 'items'}</p>}
                    <p className="mt-1 text-xs text-mute">Qty : {qty || 0} · {dateLabel(order.createdAt)}</p>
                  </div>
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-mute sm:hidden">Item</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${status.styles}`}>{status.label}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-mute sm:hidden">Status</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold tabular-nums">{formatPrice(Number(order.total) || 0, currency)}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-mute sm:hidden">Total</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setSelectedOrder(order)} className="focus-ring inline-flex items-center justify-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:bg-ink/[.05] dark:border-white/15 dark:hover:bg-white/[.08]">
                    Order Details
                  </button>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-mute sm:hidden">Details</span>
                </div>
              </div>;
            })}
          </div>
          : <div className="flex flex-col items-center px-5 py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink/[.05] text-mute"><Package className="h-5 w-5" /></div>
            <h2 className="mt-4 text-base font-semibold">{orders.length ? 'No orders in this category' : 'No orders yet'}</h2>
            <p className="mt-1 max-w-sm text-sm text-mute">{orders.length ? 'Choose another filter to see your orders.' : 'Your completed checkouts will appear here.'}</p>
            {!orders.length && <button type="button" onClick={onBackToShop} className="focus-ring mt-5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-onsolid">Browse the shop</button>}
          </div>}
    </div>

    <OrderDetailsDialog order={selectedOrder} productById={productById} currency={currency} onClose={() => setSelectedOrder(null)} />
  </main>;
}