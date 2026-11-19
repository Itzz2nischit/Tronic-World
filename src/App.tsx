import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Cpu,
  GraduationCap,
  LogIn,
  LogOut,
  MapPin,
  Minus,
  Phone,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import { CartView } from './components/CartView';
import { ImageWithFallback } from './components/ImageWithFallback';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OrdersView } from './components/OrdersView';
import { ProductModal } from './components/ProductModal';
import { ProjectChatbot } from './components/ProjectChatbot';
import { PWAInstallButton } from './components/PWAInstallButton';
import {
  IMAGE_ASSETS,
  STARTER_PRODUCTS,
  STARTER_PROJECTS,
  STORE_INFO,
} from './data/starterCatalog';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './firebase';
import {
  ADMIN_EMAIL,
  CartItem,
  ChatMessage,
  CollegeProject,
  Order,
  PRODUCT_CATEGORIES,
  Product,
  PROJECT_LEVELS,
  UserProfile,
} from './types';

type ActiveView = 'catalog' | 'projects' | 'orders' | 'admin' | 'cart';

const CART_STORAGE_KEY = 'tronic_world_cart_v1';

function toTimestampMs(val: unknown): number {
  if (!val) return 0;
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'object' && val !== null && 'toMillis' in val) {
    const fn = (val as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') return fn.call(val);
  }
  return 0;
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('catalog');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const catalogSectionRef = useRef<HTMLElement | null>(null);

  // Auth & Profile State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Firestore Catalog & Orders State
  const [firestoreProducts, setFirestoreProducts] = useState<Product[]>([]);
  const [firestoreProjects, setFirestoreProjects] = useState<CollegeProject[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Filter & Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedLevel, setSelectedLevel] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Cart State (persisted locally)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage errors
    }
  }, [cart]);

  useEffect(() => {
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const isBootstrappedAdmin = Boolean(
    user?.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
  const isAdmin = isBootstrappedAdmin || isAdminDoc;

  useEffect(() => {
    if (isAdmin && activeView === 'orders') {
      setActiveView('admin');
    }
  }, [isAdmin, activeView]);

  // Check optional /admins/{uid} document when authenticated
  useEffect(() => {
    if (!authReady || !user) {
      setIsAdminDoc(false);
      return;
    }
    const adminRef = doc(db, 'admins', user.uid);
    const unsub = onSnapshot(
      adminRef,
      (snap) => {
        setIsAdminDoc(snap.exists());
      },
      () => {
        setIsAdminDoc(false);
      }
    );
    return unsub;
  }, [authReady, user]);

  // Customer Profile Listener
  useEffect(() => {
    if (!authReady || !user) {
      setProfile(null);
      return;
    }
    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else {
          setProfile(null);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }
    );
    return unsub;
  }, [authReady, user]);

  // Public Storefront Products Listener
  useEffect(() => {
    const q = query(collection(db, 'products'), where('price', '>=', 0));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Product);
        list.sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
        setFirestoreProducts(list);
        setProductsLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'products');
      }
    );
    return unsub;
  }, []);

  // Public College Projects Listener
  useEffect(() => {
    const q = query(collection(db, 'projects'), where('estimatedPrice', '>=', 0));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as CollegeProject);
        list.sort((a, b) => a.title.localeCompare(b.title));
        setFirestoreProjects(list);
        setProjectsLoaded(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'projects');
      }
    );
    return unsub;
  }, []);

  // Customer Orders Listener (Authenticated user's own orders only)
  useEffect(() => {
    if (!authReady || !user) {
      setCustomerOrders([]);
      return;
    }
    setOrdersLoading(true);
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
        setCustomerOrders(list);
        setOrdersLoading(false);
      },
      (err) => {
        setOrdersLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );
    return unsub;
  }, [authReady, user]);

  // Admin All-Orders Listener (Bootstrapped Admin only)
  useEffect(() => {
    if (!authReady || !isBootstrappedAdmin) {
      setAdminOrders([]);
      return;
    }
    const q = query(collection(db, 'orders'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt));
        setAdminOrders(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
    );
    return unsub;
  }, [authReady, isBootstrappedAdmin]);

  // Effective Catalog (Live Firestore items when published, else authentic starter catalog preview)
  const hasFirestoreProducts = firestoreProducts.length > 0;
  const hasFirestoreProjects = firestoreProjects.length > 0;

  const products: Product[] = useMemo(() => {
    if (hasFirestoreProducts) return firestoreProducts;
    return STARTER_PRODUCTS.map((item) => ({ ...item, createdBy: 'starter' }));
  }, [hasFirestoreProducts, firestoreProducts]);

  const projects: CollegeProject[] = useMemo(() => {
    if (hasFirestoreProjects) return firestoreProjects;
    return STARTER_PROJECTS.map((item) => ({ ...item, createdBy: 'starter' }));
  }, [hasFirestoreProjects, firestoreProjects]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
      if (!catMatch) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.specs.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, selectedCategory]);

  const filteredProjects = useMemo(() => {
    if (selectedLevel === 'All') return projects;
    return projects.filter((proj) => proj.level === selectedLevel);
  }, [projects, selectedLevel]);

  // Auth Actions — automatically open Admin Console when itzz.nischit@gmail.com signs in
  const handleSignIn = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (
        cred.user.emailVerified &&
        cred.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      ) {
        setActiveView('admin');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setAuthError(msg);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    if (activeView === 'admin') {
      setActiveView('catalog');
    }
  };

  const addProductToCart = (product: Product, qty = 1) => {
    const maxStock = product.inStock ? Math.max(0, Math.floor(product.stock)) : 0;
    if (maxStock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        const nextQty = Math.min(maxStock, existing.qty + Math.max(1, qty));
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: nextQty, price: product.price } : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          price: product.price,
          qty: Math.min(maxStock, Math.max(1, qty)),
          imageKey: product.imageKey,
          imageUrl: product.imageUrl,
        },
      ];
    });
  };

  const addProjectKitToCart = (project: CollegeProject) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === project.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === project.id ? { ...i, qty: Math.min(20, i.qty + 1) } : i
        );
      }
      return [
        ...prev,
        {
          productId: project.id,
          name: `${project.title} (Project Kit)`,
          sku: `KIT-${project.level.split(' ')[0].toUpperCase()}`,
          unit: 'kit',
          price: project.estimatedPrice,
          qty: 1,
          imageKey: project.imageKey,
          imageUrl: project.imageUrl,
          isProjectKit: true,
        },
      ];
    });
    if (window.innerWidth >= 768) {
      setCartDrawerOpen(true);
    } else {
      setActiveView('cart');
    }
  };

  const updateCartQty = (productId: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    const matchedProduct = products.find((p) => p.id === productId);
    const maxAllowed = matchedProduct
      ? matchedProduct.inStock
        ? Math.max(0, Math.floor(matchedProduct.stock))
        : 0
      : 20;

    if (maxAllowed <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }

    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, qty: Math.min(maxAllowed, nextQty) } : i
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  const scrollToCatalog = () => {
    catalogSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const cartSubtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  const getCartQty = (productId: string) =>
    cart.find((i) => i.productId === productId)?.qty || 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Three-Zone Top Navigation Header */}
      <header className="sticky top-0 z-30 h-12 md:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveView('catalog')}
            className="text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            Tronic World
          </button>

          {/* Zone 2: Clean Single-Line Nav Links (Shop Admin hidden unless logged in as Admin) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveView('catalog')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors ${
                activeView === 'catalog'
                  ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-orange-600'
                  : 'hover:text-slate-900'
              }`}
            >
              Components
            </button>
            <button
              type="button"
              onClick={() => setActiveView('projects')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors ${
                activeView === 'projects'
                  ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-orange-600'
                  : 'hover:text-slate-900'
              }`}
            >
              College Projects
            </button>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-1.5 ${
                chatOpen
                  ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-orange-600'
                  : 'hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4 text-orange-600 shrink-0" />
              <span>Gemini Bot</span>
            </button>
            {!isAdmin && (
              <button
                type="button"
                onClick={() => setActiveView('orders')}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors ${
                  activeView === 'orders'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-orange-600'
                    : 'hover:text-slate-900'
                }`}
              >
                My Orders
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveView('admin')}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors ${
                  activeView === 'admin'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-orange-600'
                    : 'hover:text-slate-900'
                }`}
              >
                Admin Console
              </button>
            )}
          </nav>

          {/* Zone 3: Account Sign-In & Cart Action */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                title={`Signed in as ${user.email || user.displayName || 'User'} (Click to sign out)`}
                className="inline-flex items-center gap-1.5 min-h-[38px] md:min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="hidden sm:inline max-w-[120px] truncate">
                  {user.displayName || user.email}
                </span>
                <span className="sm:hidden">Sign out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="inline-flex items-center gap-1.5 min-h-[38px] md:min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs md:text-sm font-semibold text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>Sign in</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (window.innerWidth >= 768) {
                  setCartDrawerOpen(true);
                } else {
                  setActiveView('cart');
                }
              }}
              className="inline-flex items-center gap-2 min-h-[38px] md:min-h-[42px] px-3.5 md:px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs md:text-sm font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4 text-orange-400 shrink-0" />
              <span>Cart ({cartCount})</span>
              {cartSubtotal > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="font-mono-num">
                    ₹{cartSubtotal.toLocaleString('en-IN')}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24 md:pb-12 space-y-10">
        {authError && (
          <div
            role="alert"
            className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-center justify-between gap-4"
          >
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="text-rose-700 font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeView === 'catalog' && (
          <>
            {/* Hero Section */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch bg-white border border-slate-200 rounded-3xl overflow-hidden">
              <div className="lg:col-span-6 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <p className="text-xs font-medium text-slate-500">{STORE_INFO.hoursDaily}</p>

                  <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-slate-900 leading-[1.12] [text-wrap:balance]">
                    Microcontrollers, Sensors &amp; College Project Parts
                  </h1>

                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                    Check live stock and unit prices for Arduino, Raspberry Pi, ESP32, Hall
                    sensors, relays, and transformers. Build your bill of materials, calculate total
                    cost instantly, and order for Wagholi pickup or Pune delivery.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={scrollToCatalog}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    Buy Products
                  </button>

                  <button
                    type="button"
                    onClick={() => setChatOpen(true)}
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>Ask Gemini Bot</span>
                  </button>

                  <PWAInstallButton variant="compact" />
                </div>
              </div>

              <div className="lg:col-span-6 relative min-h-[220px] lg:min-h-full bg-slate-100">
                <img
                  src={IMAGE_ASSETS.bench}
                  alt="Tronic World Pune electronics workbench with Arduino Uno, Raspberry Pi 4, ESP32, ultrasonic sensor, and multimeter"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover lg:absolute lg:inset-0"
                />
              </div>
            </section>

            {/* Search & Category Filter Toolbar */}
            <section id="component-catalog" ref={catalogSectionRef} className="space-y-4 scroll-mt-20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Arduino, ESP32, Hall sensor, relay..."
                    aria-label="Search electronics components"
                    className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  {['All', ...PRODUCT_CATEGORIES].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Grid */}
              {!productsLoaded && firestoreProducts.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div
                      key={n}
                      className="h-80 rounded-2xl bg-white border border-slate-200 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
                  <p className="text-base font-semibold text-slate-900">
                    No matching components found
                  </p>
                  <p className="text-sm text-slate-500">
                    Try searching for Arduino, ESP32, Ultrasonic, or clear the category filter.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('All');
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map((product) => {
                    const inCartQty = getCartQty(product.id);
                    const available = product.inStock && product.stock > 0;
                    return (
                      <article
                        key={product.id}
                        className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-150"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(product)}
                          className="aspect-[4/3] bg-slate-100 overflow-hidden text-left block w-full"
                        >
                          <ImageWithFallback
                            imageKey={product.imageKey}
                            imageUrl={product.imageUrl}
                            alt={product.name}
                            className="hover:scale-[1.02] transition-transform duration-200"
                          />
                        </button>

                        <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{product.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono-num">{product.sku}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  !available
                                    ? 'text-rose-700 font-medium'
                                    : product.stock < 5
                                      ? 'text-amber-700 font-semibold'
                                      : 'text-emerald-700 font-medium'
                                }
                              >
                                {!available
                                  ? 'Out of stock'
                                  : product.stock < 5
                                    ? `Limited stock (${product.stock} left)`
                                    : `${product.stock} in stock`}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedProduct(product)}
                              className="text-left block w-full"
                            >
                              <h2 className="text-base font-bold text-slate-900 leading-snug line-clamp-2 hover:text-orange-600 transition-colors">
                                {product.name}
                              </h2>
                            </button>

                            <p className="text-xs text-slate-500 line-clamp-1 font-mono-num">
                              {product.specs}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                            <div>
                              <span className="text-lg font-bold font-mono-num text-slate-900">
                                ₹{product.price.toLocaleString('en-IN')}
                              </span>
                              <span className="text-xs text-slate-500 ml-1">/ {product.unit}</span>
                            </div>

                            {inCartQty > 0 ? (
                              <div className="inline-flex items-center border border-orange-600 bg-orange-50 rounded-xl overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => updateCartQty(product.id, inCartQty - 1)}
                                  aria-label={`Remove one ${product.name}`}
                                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-orange-700 hover:bg-orange-100"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-7 text-center text-xs font-bold font-mono-num text-orange-900">
                                  {inCartQty}
                                </span>
                                <button
                                  type="button"
                                  disabled={!available || inCartQty >= product.stock}
                                  onClick={() => updateCartQty(product.id, inCartQty + 1)}
                                  aria-label={`Add one more ${product.name}`}
                                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-orange-700 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={!available}
                                onClick={() => addProductToCart(product, 1)}
                                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-500 transition-colors whitespace-nowrap shrink-0"
                              >
                                {available ? 'Add to Cart' : 'Unavailable'}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {activeView === 'projects' && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  College &amp; Engineering Project Builds
                </h1>
                <p className="text-sm text-slate-600 max-w-2xl">
                  Ready-to-assemble hardware kits and tested builds for School Science, Diploma, and
                  BE / B.Tech major and minor projects in Pune.
                </p>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {['All', ...PROJECT_LEVELS].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSelectedLevel(lvl)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      selectedLevel === lvl
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {!projectsLoaded && firestoreProjects.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-72 rounded-2xl bg-white border border-slate-200 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredProjects.map((project) => (
                  <article
                    key={project.id}
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
                  >
                    <div className="aspect-[16/9] bg-slate-100 overflow-hidden">
                      <ImageWithFallback
                        imageKey={project.imageKey}
                        imageUrl={project.imageUrl}
                        alt={project.title}
                      />
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-orange-700">{project.domain}</span>
                          <span aria-hidden="true">·</span>
                          <span>{project.level}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-num">
                            {project.leadTimeDays} {project.leadTimeDays === 1 ? 'day' : 'days'}{' '}
                            build
                          </span>
                        </div>

                        <h2 className="text-lg font-bold text-slate-900 leading-snug">
                          {project.title}
                        </h2>
                        <p className="text-sm text-slate-600 leading-relaxed">{project.summary}</p>

                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                          <p className="text-xs font-semibold text-slate-900">
                            Included Bill of Materials
                          </p>
                          <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                            {project.componentsList.map((comp, idx) => (
                              <li key={idx}>{comp}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100">
                        <div>
                          <span className="text-xs text-slate-500 block">Complete Kit Cost</span>
                          <span className="text-xl font-bold font-mono-num text-slate-900">
                            ₹{project.estimatedPrice.toLocaleString('en-IN')}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => addProjectKitToCart(project)}
                          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
                        >
                          Add Kit to Cart
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  Building a custom BE / Diploma synopsis project?
                </h3>
                <p className="text-sm text-slate-600">
                  Visit our Wagholi store on Pune - Nagar Rd or call {STORE_INFO.phone} with your
                  circuit requirement for custom sensor &amp; microcontroller sourcing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Ask Gemini Bot</span>
                </button>
                <a
                  href={`tel:${STORE_INFO.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call Shop Desk</span>
                </a>
              </div>
            </div>
          </section>
        )}

        {activeView === 'orders' && (
          <OrdersView
            user={user}
            orders={customerOrders}
            loading={ordersLoading}
            onSignIn={handleSignIn}
            onBrowseCatalog={() => setActiveView('catalog')}
          />
        )}

        {activeView === 'admin' && (
          <AdminPanel
            user={user}
            isAdmin={isAdmin}
            products={products}
            projects={projects}
            orders={isBootstrappedAdmin ? adminOrders : customerOrders}
            hasFirestoreProducts={hasFirestoreProducts}
            hasFirestoreProjects={hasFirestoreProjects}
            onSignIn={handleSignIn}
          />
        )}

        {activeView === 'cart' && (
          <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Cart &amp; Cost Calculator</h2>
              <span className="text-xs font-mono-num text-slate-500">{cartCount} units</span>
            </div>
            <CartView
              items={cart}
              products={products}
              user={user}
              profile={profile}
              onSignIn={handleSignIn}
              onUpdateQty={updateCartQty}
              onRemove={removeFromCart}
              onClearCart={() => setCart([])}
              onOrderSuccess={() => {}}
              onViewOrders={() => setActiveView('orders')}
            />
          </div>
        )}

        {/* Store Location & Hours Footer Section */}
        <footer className="border-t border-slate-200 pt-8 mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-600">
          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900">Tronic World — Pune</h3>
            <p className="text-xs leading-relaxed">
              Electronics components, microcontrollers, sensors, robotics modules, and college
              engineering project kits.
            </p>
            <p className="text-xs text-slate-500">
              {STORE_INFO.rating}★ ({STORE_INFO.reviewCount} reviews) · {STORE_INFO.platforms}
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-900">Store Address</h4>
            <p className="text-xs leading-relaxed flex items-start gap-2">
              <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <span>{STORE_INFO.address}</span>
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-900">Store Hours &amp; Contact</h4>
            <p className="text-xs">{STORE_INFO.hoursDaily}</p>
            <p className="text-xs">{STORE_INFO.hoursWed}</p>
            <a
              href={`tel:${STORE_INFO.phone.replace(/\s+/g, '')}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:text-orange-600 font-mono-num"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{STORE_INFO.phone}</span>
            </a>
          </div>
        </footer>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (4 tabs: Parts, Projects, Cart, and Orders for customers or Admin when signed in as Admin) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveView('catalog')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 ${
            activeView === 'catalog' ? 'text-orange-600' : 'text-slate-500'
          }`}
        >
          <Cpu className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Parts</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('projects')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 ${
            activeView === 'projects' ? 'text-orange-600' : 'text-slate-500'
          }`}
        >
          <GraduationCap className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Projects</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('cart')}
          className={`h-full flex flex-col items-center justify-center gap-0.5 relative ${
            activeView === 'cart' ? 'text-orange-600' : 'text-slate-500'
          }`}
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-orange-600 text-white text-[10px] font-bold font-mono-num flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold">Cart</span>
        </button>

        {!isAdmin ? (
          <button
            type="button"
            onClick={() => setActiveView('orders')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 ${
              activeView === 'orders' ? 'text-orange-600' : 'text-slate-500'
            }`}
          >
            <ReceiptText className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Orders</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setActiveView('admin')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 ${
              activeView === 'admin' ? 'text-orange-600' : 'text-slate-500'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Admin</span>
          </button>
        )}
      </nav>

      {/* Desktop Slide-Over Cart & Cost Calculator Drawer */}
      {cartDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm"
          onClick={() => setCartDrawerOpen(false)}
        >
          <aside
            aria-label="Shopping cart and cost calculator"
            className="w-full max-w-md bg-slate-50 h-full border-l border-slate-200 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Cart &amp; Cost Calculator</h2>
                <p className="text-xs text-slate-500">Tronic World Wagholi Order Desk</p>
              </div>
              <button
                type="button"
                onClick={() => setCartDrawerOpen(false)}
                aria-label="Close cart drawer"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              <CartView
                items={cart}
                products={products}
                user={user}
                profile={profile}
                onSignIn={handleSignIn}
                onUpdateQty={updateCartQty}
                onRemove={removeFromCart}
                onClearCart={() => setCart([])}
                onOrderSuccess={() => {}}
                onViewOrders={() => setActiveView('orders')}
                onCloseDrawer={() => setCartDrawerOpen(false)}
              />
            </div>
          </aside>
        </div>
      )}

      {/* Product Detail Modal */}
      <ProductModal
        product={selectedProduct}
        cartQty={selectedProduct ? getCartQty(selectedProduct.id) : 0}
        onClose={() => setSelectedProduct(null)}
        onAdd={(prod, qty) => addProductToCart(prod, qty)}
      />

      {/* Project Components Gemini Chatbot */}
      <ProjectChatbot
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        products={products}
        messages={chatMessages}
        setMessages={setChatMessages}
        onAddProduct={(prod, qty) => addProductToCart(prod, qty)}
        getCartQty={getCartQty}
        onOpenCart={() => {
          if (window.innerWidth >= 768) {
            setCartDrawerOpen(true);
          } else {
            setActiveView('cart');
          }
        }}
      />

      {/* Floating Quick-Open Gemini Bot Launcher */}
      {!chatOpen && !cartDrawerOpen && (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          aria-label="Open Gemini Electronics Bot"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 min-h-[48px] px-4 py-2.5 rounded-2xl bg-slate-900 text-white shadow-lg border border-slate-700 hover:bg-slate-800 transition-colors inline-flex items-center gap-2"
        >
          <Sparkles className="w-5 h-5 text-orange-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold whitespace-nowrap">Gemini Bot</span>
        </button>
      )}

      <OfflineIndicator />
    </div>
  );
}
