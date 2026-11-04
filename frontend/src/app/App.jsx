import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Navbar from '../features/navigation/components/Navbar.jsx';
import Hero from '../features/catalog/components/Hero.jsx';
const FilterBar = lazy(() => import('../features/catalog/components/FilterBar.jsx'));
const ProductGrid = lazy(() => import('../features/catalog/components/ProductGrid.jsx'));
const About = lazy(() => import('../features/catalog/components/About.jsx'));
const QuickView = lazy(() => import('../features/catalog/components/QuickView.jsx'));
const CartDrawer = lazy(() => import('../features/cart/components/CartDrawer.jsx'));
const SearchOverlay = lazy(() => import('../features/catalog/components/SearchOverlay.jsx'));
import Toast from '../shared/components/Toast.jsx';
import BackToTop from '../shared/components/BackToTop.jsx';
import Footer from '../features/layout/components/Footer.jsx';
const AuthModal = lazy(() => import('../features/auth/components/AuthModal.jsx'));
import useAuthSession from '../features/auth/hooks/useAuthSession.js';
import { logout } from '../features/auth/supabase.js';
const AccountSettingsModal = lazy(() => import('../features/account/components/AccountSettingsModal.jsx'));
const UsernameSetupModal = lazy(() => import('../features/account/components/UsernameSetupModal.jsx'));
const OrderHistoryPage = lazy(() => import('../features/account/components/OrderHistoryPage.jsx'));
import useCustomerProfile from '../features/account/hooks/useCustomerProfile.js';
import { addMyWishlistItem, loadMyCart, loadMyWishlist, removeMyWishlistItem, saveMyCart } from '../features/account/accountService.js';
import { clearGuestCart, mergeCartItems, readGuestCart, saveGuestCart, serializeCartItems } from '../features/cart/cartModel.js';
const WishlistDrawer = lazy(() => import('../features/wishlist/components/WishlistDrawer.jsx'));
import { useCatalog } from '../features/catalog/hooks/useCatalog.js';
import { mapProduct, variantPrice } from '../features/catalog/model.js';
import { useScrollLock, useTheme } from '../shared/hooks/index.js';

function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const key = `${action.id}::${action.variantId || 'base'}`;
      const found = state.find((item) => item.key === key);
      const maxQty = Math.max(0, Number(action.maxQty) || 0);
      const qty = Number(action.qty);
      const nextQty = (found?.qty || 0) + qty;
      // Keep the invariant in the reducer too, in case an event fires twice
      // before the UI has re-rendered with the latest cart.
      if (!Number.isInteger(qty) || qty < 1 || nextQty > maxQty) return state;
      return found
        ? state.map((item) => item.key === key ? { ...item, qty: nextQty } : item)
        : [...state, { key, id: action.id, variantId: action.variantId || null, qty }];
    }
    case 'qty': return state.map((item) => item.key === action.key ? { ...item, qty: Math.max(1, Math.min(action.maxQty ?? 99, action.qty)) } : item);
    case 'remove': return state.filter((item) => item.key !== action.key);
    case 'clear': return [];
    case 'replace': return Array.isArray(action.items) ? action.items : [];
    default: return state;
  }
}

export default function App() {
  const heroRef = useRef(null);
  const shopRef = useRef(null);
  const wishlistIdsRef = useRef([]);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/');
  const [theme, toggleTheme] = useTheme();
  const [pastHero, setPastHero] = useState(false);
  const [shopComponentsReady, setShopComponentsReady] = useState(false);
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('featured');
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [cartScope, setCartScope] = useState(null);
  const [cartReady, setCartReady] = useState(false);
  const [cartLoadError, setCartLoadError] = useState('');
  const cartLoadGeneration = useRef(0);
  const cartOwnerRef = useRef(null);
  const cartWriteQueueRef = useRef(Promise.resolve());
  const cartWriteErrorRef = useRef(false);
  const [quickView, setQuickView] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [wishlistAfterAuth, setWishlistAfterAuth] = useState(false);
  const [pendingWishlistProduct, setPendingWishlistProduct] = useState(() => {
    try { return sessionStorage.getItem('strawping.pendingWishlist') || null; } catch { return null; }
  });
  const [wishlistIds, setWishlistIds] = useState([]);
  const { user, session, loading: authLoading } = useAuthSession();
  const {
    data: catalog,
    isLoading: catalogLoading,
    isError: catalogFailed,
    error: catalogError,
  } = useCatalog();
  const products = useMemo(
    () => (catalog?.products ?? []).map(mapProduct),
    [catalog?.products],
  );
  const settings = useMemo(() => ({
    storeName: 'Strawping',
    tagline: 'Thoughtfully chosen for the everyday.',
    contactTelegram: '',
    ...(catalog?.settings ?? {}),
  }), [catalog?.settings]);
  const syncError = catalogFailed
    ? catalogError?.message || 'Catalog refresh failed; showing cached products.'
    : '';
  const { profile, setProfile, loading: profileLoading, error: profileError, loadedForUserId, reload: reloadProfile } = useCustomerProfile(user?.id);
  const isOrderHistory = currentPath === '/account/orders';
  const [usernamePromptOpen, setUsernamePromptOpen] = useState(false);
  useEffect(() => {
    if (isOrderHistory || shopComponentsReady) return undefined;
    const target = shopRef.current;
    if (!target) return undefined;

    if (!('IntersectionObserver' in window)) {
      setShopComponentsReady(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShopComponentsReady(true);
        observer.disconnect();
      }
    }, { rootMargin: '900px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isOrderHistory, shopComponentsReady]);
  // On phones the hero fills the first screen, so the product section is far below the
  // IntersectionObserver margin. Warm the product chunks once the page is idle instead of
  // waiting for the shopper to scroll, so the grid is ready by the time they get there.
  useEffect(() => {
    if (isOrderHistory || shopComponentsReady) return undefined;
    const warm = () => setShopComponentsReady(true);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(id);
  }, [isOrderHistory, shopComponentsReady]);
  const expectedCartScope = user?.id || 'guest';
  const cartIsReady = cartReady && cartScope === expectedCartScope;
  const currentCart = cartIsReady ? cart : [];

  useEffect(() => {
    if (!user) {
      setUsernamePromptOpen(false);
      return;
    }
    if (profileLoading || profileError || loadedForUserId !== user.id) return;
    if (profile?.username?.trim()) {
      setUsernamePromptOpen(false);
      return;
    }
    let wasDismissed = false;
    try {
      wasDismissed = localStorage.getItem(`strawping.usernamePromptDismissed.${user.id}`) === 'true';
    } catch {}
    setUsernamePromptOpen(!wasDismissed);
  }, [user?.id, profile, profileLoading, profileError, loadedForUserId]);

  const dismissUsernamePrompt = useCallback(() => {
    if (user?.id) {
      try { localStorage.setItem(`strawping.usernamePromptDismissed.${user.id}`, 'true'); } catch {}
    }
    setUsernamePromptOpen(false);
  }, [user?.id]);

  const navigateTo = useCallback((target) => {
    window.history.pushState({}, '', target);
    setCurrentPath(window.location.pathname.replace(/\/+$/, '') || '/');
  }, []);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname.replace(/\/+$/, '') || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (currentPath === '/account/orders') {
      window.scrollTo({ top: 0 });
      return;
    }
    if (currentPath !== '/') return;
    const hash = window.location.hash.slice(1);
    if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }));
    else window.scrollTo({ top: 0 });
  }, [currentPath]);

  useEffect(() => {
    if (authLoading) return undefined;
    const owner = user?.id || 'guest';
    const generation = ++cartLoadGeneration.current;
    let active = true;
    cartOwnerRef.current = owner;
    setCartReady(false);
    setCartScope(null);
    setCartLoadError('');

    const hydrateCart = async () => {
      try {
        const items = owner === 'guest'
          ? readGuestCart()
          : mergeCartItems(await loadMyCart(owner), readGuestCart());
        if (!active || generation !== cartLoadGeneration.current) return;
        dispatch({ type: 'replace', items });
        setCartScope(owner);
        setCartReady(true);
        setCartLoadError('');
        cartWriteErrorRef.current = false;
      } catch (error) {
        if (!active || generation !== cartLoadGeneration.current) return;
        dispatch({ type: 'replace', items: [] });
        setCartScope(null);
        setCartReady(false);
        setCartLoadError(error.message || 'Could not load your saved cart. Refresh and try again.');
        setToast({
          id: Date.now(),
          type: 'error',
          message: error.message || 'Could not load your saved cart. Refresh and try again.',
        });
      }
    };

    void hydrateCart();
    return () => { active = false; };
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!cartIsReady) return undefined;
    const owner = cartScope;
    const items = serializeCartItems(currentCart);
    if (owner === 'guest') {
      saveGuestCart(items);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      const write = cartWriteQueueRef.current
        .catch(() => {})
        .then(() => saveMyCart(owner, items));
      cartWriteQueueRef.current = write;
      write.then(() => {
        if (!active || cartOwnerRef.current !== owner) return;
        clearGuestCart();
        cartWriteErrorRef.current = false;
      }).catch((error) => {
        if (!active || cartOwnerRef.current !== owner || cartWriteErrorRef.current) return;
        cartWriteErrorRef.current = true;
        setToast({
          id: Date.now(),
          type: 'error',
          message: error.message || 'Could not sync your cart. Your changes may not be saved.',
        });
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cartIsReady, cartScope, currentCart, expectedCartScope]);
  useEffect(() => {
    if (authLoading) return undefined;
    if (!user) {
      wishlistIdsRef.current = [];
      setWishlistIds([]);
      return undefined;
    }
    let active = true;
    loadMyWishlist(user.id)
      .then((ids) => {
        if (!active) return;
        wishlistIdsRef.current = ids;
        setWishlistIds(ids);
      })
      .catch((error) => {
        if (!active) return;
        setToast({ id: Date.now(), type: 'error', message: error.message || 'Could not load your wishlist.' });
      });
    return () => { active = false; };
  }, [authLoading, user?.id]);
  useEffect(() => {
    if (!user) return;
    if (wishlistAfterAuth) {
      setWishlistOpen(true);
      setWishlistAfterAuth(false);
    }
    if (pendingWishlistProduct) {
      const productId = pendingWishlistProduct;
      setPendingWishlistProduct(null);
      try { sessionStorage.removeItem('strawping.pendingWishlist'); } catch {}
      addMyWishlistItem(productId)
        .then(() => {
          if (wishlistIdsRef.current.includes(productId)) return;
          const next = [productId, ...wishlistIdsRef.current];
          wishlistIdsRef.current = next;
          setWishlistIds(next);
        })
        .catch((error) => setToast({ id: Date.now(), type: 'error', message: error.message || 'Could not save that item.' }));
    }
  }, [user?.id, wishlistAfterAuth, pendingWishlistProduct]);
  useEffect(() => {
    if (isOrderHistory) {
      setPastHero(false);
      return undefined;
    }
    const hero = heroRef.current;
    if (!hero) return undefined;
    if (!('IntersectionObserver' in window)) {
      const onScroll = () => setPastHero(window.scrollY > (heroRef.current?.offsetHeight ?? 600) - 96);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      return () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting),
      { rootMargin: '-96px 0px 0px 0px' },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [isOrderHistory]);
  useEffect(() => {
    const onKey = (event) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
      if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) { event.preventDefault(); setSearchOpen(true); }
      else if (event.key === 'Escape') { setQuickView(null); setCartOpen(false); setSearchOpen(false); setAuthOpen(false); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  useScrollLock(Boolean(quickView || cartOpen || searchOpen || wishlistOpen));

  const categories = useMemo(() => ['All', ...new Set(products.map((p) => p.category).filter(Boolean))], [products]);
  const counts = useMemo(() => Object.fromEntries(categories.map((name) => [name, name === 'All' ? products.length : products.filter((p) => p.category === name).length])), [categories, products]);
  const visible = useMemo(() => {
    const list = category === 'All' ? [...products] : products.filter((p) => p.category === category);
    if (sort === 'low') list.sort((a, b) => a.price - b.price);
    if (sort === 'high') list.sort((a, b) => b.price - a.price);
    return list;
  }, [products, category, sort]);
  const cartCount = currentCart.reduce((total, item) => total + item.qty, 0);
  const featuredProduct = products.find((product) => product.featured === true) || products[0] || null;
  const cartQtyFor = useCallback((product, variantId = null) => (
    currentCart.find((line) => line.id === product.id && (line.variantId || null) === (variantId || null))?.qty || 0
  ), [currentCart]);
  const canAddToBag = useCallback((product) => {
    if (!product.inStock) return false;
    if (product.hasVariants) {
      return product.variants.some((variant) => (
        variant.inStock !== false && Number(variant.stock) > cartQtyFor(product, variant.id)
      ));
    }
    return Number(product.stock) > cartQtyFor(product);
  }, [cartQtyFor]);
  const addToCart = useCallback((product, variant, qty = 1) => {
    if (!cartIsReady) {
      setToast({ id: Date.now(), type: 'error', message: 'Your cart is still loading. Please try again in a moment.' });
      return false;
    }
    if (product.hasVariants && !variant) { setQuickView(product); return; }
    try {
      const requestedQty = Number(qty);
      const maxQty = Math.max(0, Number(variant ? variant.stock : product.stock) || 0);
      const alreadyInBag = cartQtyFor(product, variant?.id || null);
      const remaining = Math.max(0, maxQty - alreadyInBag);
      if (!Number.isInteger(requestedQty) || requestedQty < 1 || requestedQty > remaining) {
        setToast({
          id: Date.now(),
          type: 'error',
          message: remaining > 0
            ? `Only ${remaining} more available. Please adjust the quantity.`
            : `All ${maxQty} available are already in your bag.`,
        });
        return false;
      }
      dispatch({ type: 'add', id: product.id, variantId: variant?.id || null, qty: requestedQty, maxQty });
      setToast({
        id: Date.now(),
        type: 'success',
        product,
        size: variant ? [variant.size, variant.color, variant.type].filter(Boolean).join(' / ') : '',
        qty: requestedQty,
      });
      return true;
    } catch {
      setToast({ id: Date.now(), type: 'error', message: 'Could not add this item. Please try again.' });
      return false;
    }
  }, [cartIsReady, cartQtyFor]);
  const addToCartRef = useRef(addToCart);
  addToCartRef.current = addToCart;
  const addFromGrid = useCallback((product) => (
    product.hasVariants ? setQuickView(product) : addToCartRef.current(product, null)
  ), []);
  const toggleWishlist = useCallback(async (product) => {
    if (!user?.id) {
      try { sessionStorage.setItem('strawping.pendingWishlist', product.id); } catch {}
      setPendingWishlistProduct(product.id);
      setAuthOpen(true);
      return;
    }
    const productId = product.id;
    const wasSaved = wishlistIdsRef.current.includes(productId);
    const optimistic = wasSaved
      ? wishlistIdsRef.current.filter((id) => id !== productId)
      : [productId, ...wishlistIdsRef.current];
    wishlistIdsRef.current = optimistic;
    setWishlistIds(optimistic);
    try {
      if (wasSaved) await removeMyWishlistItem(productId);
      else await addMyWishlistItem(productId);
    } catch (error) {
      const current = wishlistIdsRef.current;
      const rollback = wasSaved
        ? (current.includes(productId) ? current : [productId, ...current])
        : current.filter((id) => id !== productId);
      wishlistIdsRef.current = rollback;
      setWishlistIds(rollback);
      setToast({ id: Date.now(), type: 'error', message: error.message || 'Could not update your wishlist.' });
    }
  }, [user?.id]);
  const openWishlist = useCallback(() => {
    if (user) setWishlistOpen(true);
    else {
      setWishlistAfterAuth(true);
      setAuthOpen(true);
    }
  }, [user?.id]);
  const scrollToShop = useCallback(() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), []);
  const cartLines = currentCart.map((item) => {
    const product = products.find((p) => p.id === item.id);
    const variant = product?.variants?.find((v) => v.id === item.variantId);
    return product ? { ...item, product, variant, maxQty: Math.max(0, Number(variant ? variant.stock : product.stock) || 0), qty: Math.min(item.qty, Math.max(0, Number(variant ? variant.stock : product.stock) || 0)), unitPrice: variantPrice(product, variant) } : null;
  }).filter(Boolean);
  const wishlistIdSet = useMemo(() => new Set(wishlistIds), [wishlistIds]);

  return <div className="min-h-screen overflow-x-hidden">
    {syncError && <div role="status" className="fixed bottom-3 left-3 z-[70] max-w-sm rounded-xl bg-ink px-4 py-3 text-xs text-white shadow-lg">Catalog sync issue: {syncError}</div>}
    <Navbar solid={pastHero || isOrderHistory} isAccountPage={isOrderHistory} cartCount={cartCount} wishlistCount={wishlistIds.length} onWishlist={openWishlist} onCart={() => setCartOpen(true)} onSearch={() => setSearchOpen(true)} theme={theme} onToggleTheme={toggleTheme} user={user} onAuthClick={() => setAuthOpen(true)} onSettings={() => setSettingsOpen(true)} onOrderHistory={() => navigateTo('/account/orders')} onLogout={async () => { try { await logout(); } catch (error) { setToast({ id: Date.now(), type: 'error', message: error.message || 'Could not log out. Please try again.' }); } }} />
    {isOrderHistory
      ? <Suspense fallback={<div className="min-h-[60svh]" />}><OrderHistoryPage user={user} authLoading={authLoading} products={products} currency={settings.currency || '$'} onSignIn={() => setAuthOpen(true)} onBackToShop={() => navigateTo('/#shop')} /></Suspense>
      : <main>
        <Hero ref={heroRef} onExplore={scrollToShop} loading={catalogLoading} featured={featuredProduct} onFeatured={() => featuredProduct && setQuickView(featuredProduct)} />
        <section id="shop" ref={shopRef} className="relative mx-auto max-w-7xl scroll-mt-16 px-5 pb-28 pt-20 sm:pt-28">
          {shopComponentsReady ? (
            <Suspense fallback={<div aria-busy="true" className="flex min-h-[54svh] items-center justify-center text-sm text-mute">Loading products…</div>}>
              <FilterBar categories={categories} active={category} onChange={setCategory} counts={counts} sort={sort} onSort={setSort} shown={visible.length} />
              <ProductGrid products={visible} loading={catalogLoading} onQuickView={setQuickView} canAdd={canAddToBag} wishlistIdSet={wishlistIdSet} onToggleWishlist={toggleWishlist} onAdd={addFromGrid} />
            </Suspense>
          ) : (
            <div aria-busy="true" className="flex min-h-[54svh] items-center justify-center text-sm text-mute">
              Loading products…
            </div>
          )}
        </section>
        <Suspense fallback={<div className="min-h-24" />}><About /></Suspense>
      </main>}
    <Footer />
    {quickView && <Suspense fallback={null}><QuickView product={quickView} onClose={() => setQuickView(null)} onAdd={addToCart} cartQtyFor={cartQtyFor} /></Suspense>}
    {cartOpen && <Suspense fallback={null}><CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cartLines} dispatch={dispatch} user={user} session={session} profile={profile} cartLoading={!cartIsReady && !cartLoadError} cartLoadError={cartLoadError} /></Suspense>}
    {searchOpen && <Suspense fallback={null}><SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={(p) => { setSearchOpen(false); setQuickView(p); }} products={products} /></Suspense>}
    {wishlistOpen && <Suspense fallback={null}><WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} products={products} productIds={wishlistIds} onRemove={(id) => toggleWishlist({ id })} onAdd={(p) => { setWishlistOpen(false); if (p.hasVariants) setQuickView(p); else addToCart(p, null); }} /></Suspense>}
    {authOpen && <Suspense fallback={null}><AuthModal open={authOpen} onClose={() => setAuthOpen(false)} /></Suspense>}
    {settingsOpen && <Suspense fallback={null}><AccountSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} profile={profile} onProfileUpdated={(nextProfile) => { setProfile(nextProfile); reloadProfile(); }} /></Suspense>}
    {usernamePromptOpen && <Suspense fallback={null}><UsernameSetupModal
      open={usernamePromptOpen}
      onClose={dismissUsernamePrompt}
      user={user}
      onSaved={(nextProfile) => {
        setProfile(nextProfile);
        dismissUsernamePrompt();
      }}
    /></Suspense>}
    <Toast toast={toast} onDismiss={() => setToast(null)} onView={() => { setToast(null); setCartOpen(true); }} />
    <BackToTop visible={pastHero && !cartOpen} />
  </div>;
}
