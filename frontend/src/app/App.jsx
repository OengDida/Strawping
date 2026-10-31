import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Navbar from '../features/navigation/components/Navbar.jsx';
import Hero from '../features/catalog/components/Hero.jsx';
import FilterBar from '../features/catalog/components/FilterBar.jsx';
import ProductGrid from '../features/catalog/components/ProductGrid.jsx';
import QuickView from '../features/catalog/components/QuickView.jsx';
import CartDrawer from '../features/cart/components/CartDrawer.jsx';
import SearchOverlay from '../features/catalog/components/SearchOverlay.jsx';
import Toast from '../shared/components/Toast.jsx';
import BackToTop from '../shared/components/BackToTop.jsx';
import About from '../features/catalog/components/About.jsx';
import Footer from '../features/layout/components/Footer.jsx';
import { loadStore } from '../shared/services/api.js';
import { mapProduct, variantPrice } from '../features/catalog/model.js';
import { saveJSON, useScrollLock, useTheme } from '../shared/hooks/index.js';

function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const key = `${action.id}::${action.variantId || 'base'}`;
      const found = state.find((item) => item.key === key);
      return found
        ? state.map((item) => item.key === key ? { ...item, qty: Math.min(99, item.qty + action.qty) } : item)
        : [...state, { key, id: action.id, variantId: action.variantId || null, qty: action.qty }];
    }
    case 'qty': return state.map((item) => item.key === action.key ? { ...item, qty: Math.max(1, Math.min(99, action.qty)) } : item);
    case 'remove': return state.filter((item) => item.key !== action.key);
    case 'clear': return [];
    default: return state;
  }
}
function readCart() { try { const value = JSON.parse(localStorage.getItem('strawping.cart') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }

export default function App() {
  const heroRef = useRef(null);
  const [theme, toggleTheme] = useTheme();
  const [pastHero, setPastHero] = useState(false);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({ storeName: 'Strawping', tagline: 'Thoughtfully chosen for the everyday.', contactTelegram: '' });
  const [syncError, setSyncError] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('featured');
  const [cart, dispatch] = useReducer(cartReducer, undefined, readCart);
  const [quickView, setQuickView] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let alive = true;
    loadStore().then((result) => {
      if (!alive) return;
      setProducts(result.products.map(mapProduct));
      setSettings((old) => ({ ...old, ...result.settings }));
      setSyncError(result.online ? '' : (result.error || 'Catalog is offline; showing cached products.'));
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => { saveJSON('strawping.cart', cart); }, [cart]);
  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > (heroRef.current?.offsetHeight ?? 600) - 96);
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
      if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) { event.preventDefault(); setSearchOpen(true); }
      else if (event.key === 'Escape') { setQuickView(null); setCartOpen(false); setSearchOpen(false); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  useScrollLock(Boolean(quickView || cartOpen || searchOpen));

  const categories = useMemo(() => ['All', ...new Set(products.map((p) => p.category).filter(Boolean))], [products]);
  const counts = useMemo(() => Object.fromEntries(categories.map((name) => [name, name === 'All' ? products.length : products.filter((p) => p.category === name).length])), [categories, products]);
  const visible = useMemo(() => {
    const list = category === 'All' ? [...products] : products.filter((p) => p.category === category);
    if (sort === 'low') list.sort((a, b) => a.price - b.price);
    if (sort === 'high') list.sort((a, b) => b.price - a.price);
    return list;
  }, [products, category, sort]);
  const cartCount = cart.reduce((total, item) => total + item.qty, 0);
  const addToCart = useCallback((product, variant, qty = 1) => {
    if (product.hasVariants && !variant) { setQuickView(product); return; }
    dispatch({ type: 'add', id: product.id, variantId: variant?.id || null, qty });
    setToast({ id: Date.now(), product, size: variant ? [variant.size, variant.color, variant.type].filter(Boolean).join(' / ') : '', qty });
  }, []);
  const scrollToShop = useCallback(() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), []);
  const cartLines = cart.map((item) => {
    const product = products.find((p) => p.id === item.id);
    const variant = product?.variants?.find((v) => v.id === item.variantId);
    return product ? { ...item, product, variant, unitPrice: variantPrice(product, variant) } : null;
  }).filter(Boolean);

  return <div className="min-h-screen overflow-x-clip">
    {syncError && <div role="status" className="fixed bottom-3 left-3 z-[70] max-w-sm rounded-xl bg-ink px-4 py-3 text-xs text-white shadow-lg">Catalog sync issue: {syncError}</div>}
    <Navbar solid={pastHero} cartCount={cartCount} onCart={() => setCartOpen(true)} onSearch={() => setSearchOpen(true)} theme={theme} onToggleTheme={toggleTheme} />
    <main>
      <Hero ref={heroRef} onExplore={scrollToShop} featured={products[0]} onFeatured={() => products[0] && setQuickView(products[0])} />
      <section id="shop" className="relative mx-auto max-w-7xl scroll-mt-16 px-5 pb-28 pt-20 sm:pt-28">
        <FilterBar categories={categories} active={category} onChange={setCategory} counts={counts} sort={sort} onSort={setSort} shown={visible.length} />
        <ProductGrid products={visible} onQuickView={setQuickView} onAdd={(p) => p.hasVariants ? setQuickView(p) : addToCart(p, null)} />
        {products.length === 0 && <p className="py-16 text-center text-sm text-mute">No products are available yet. Add products through the existing admin panel.</p>}
      </section>
      <About />
    </main>
    <Footer />
    <QuickView product={quickView} onClose={() => setQuickView(null)} onAdd={addToCart} />
    <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cartLines} dispatch={dispatch} />
    <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={(p) => { setSearchOpen(false); setQuickView(p); }} products={products} />
    <Toast toast={cartOpen || quickView ? null : toast} onDismiss={() => setToast(null)} onView={() => { setToast(null); setCartOpen(true); }} />
    <BackToTop visible={pastHero && !cartOpen} />
  </div>;
}
