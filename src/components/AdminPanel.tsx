import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Camera,
  Check,
  Edit3,
  Mail,
  MailX,
  PackagePlus,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { STARTER_PRODUCTS, STARTER_PROJECTS } from '../data/starterCatalog';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ADMIN_EMAIL,
  CollegeProject,
  ImageKey,
  InventoryAlertSettings,
  Order,
  OrderStatus,
  PRODUCT_CATEGORIES,
  Product,
  ProductCategory,
  PROJECT_DOMAINS,
  PROJECT_LEVELS,
  ProjectDomain,
  ProjectLevel,
  SCHEMA_LIMITS,
} from '../types';
import { ImageWithFallback } from './ImageWithFallback';
import { OrderRevenueChart } from './OrderRevenueChart';

interface AdminPanelProps {
  user: User | null;
  isAdmin: boolean;
  products: Product[];
  projects: CollegeProject[];
  orders: Order[];
  hasFirestoreProducts: boolean;
  hasFirestoreProjects: boolean;
  onSignIn: () => Promise<void>;
}

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'packing',
  'ready',
  'completed',
  'cancelled',
];

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const targetW = 480;
        const targetH = 360;
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, targetW, targetH);

        const scale = Math.max(targetW / img.width, targetH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (targetW - drawW) / 2;
        const dy = (targetH - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);

        let quality = 0.78;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > SCHEMA_LIMITS.IMAGE_URL_MAX && quality > 0.3) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > SCHEMA_LIMITS.IMAGE_URL_MAX) {
          reject(new Error('Image is still too large after compression.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  user,
  isAdmin,
  products,
  projects,
  orders,
  hasFirestoreProducts,
  hasFirestoreProjects,
  onSignIn,
}) => {
  const [adminTab, setAdminTab] = useState<'inventory' | 'projects' | 'orders'>('inventory');
  const [seeding, setSeeding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Add Product Form State
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodCategory, setProdCategory] = useState<ProductCategory>('Microcontrollers');
  const [prodPrice, setProdPrice] = useState('');
  const [prodUnit, setProdUnit] = useState('pc');
  const [prodStock, setProdStock] = useState('20');
  const [prodSpecs, setProdSpecs] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodImageKey, setProdImageKey] = useState<ImageKey>('arduino');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodFeatured, setProdFeatured] = useState(false);
  const [savingProd, setSavingProd] = useState(false);

  // Inline Edit State
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');

  // Add College Project Form State
  const [projTitle, setProjTitle] = useState('');
  const [projDomain, setProjDomain] = useState<ProjectDomain>('IoT & WiFi');
  const [projLevel, setProjLevel] = useState<ProjectLevel>('BE / B.Tech');
  const [projPrice, setProjPrice] = useState('');
  const [projLeadDays, setProjLeadDays] = useState('2');
  const [projSummary, setProjSummary] = useState('');
  const [projComponentsText, setProjComponentsText] = useState('');
  const [projImageKey, setProjImageKey] = useState<ImageKey>('robotics');
  const [savingProj, setSavingProj] = useState(false);

  // Low-Stock Email Alert Settings (/settings/inventoryAlerts)
  const [alertDocExists, setAlertDocExists] = useState(false);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(true);
  const [alertEmailInput, setAlertEmailInput] = useState(ADMIN_EMAIL);
  const [savingAlertSettings, setSavingAlertSettings] = useState(false);

  // Bulk Non-Pending Order Deletion
  const [confirmDeleteNonPending, setConfirmDeleteNonPending] = useState(false);
  const [deletingNonPending, setDeletingNonPending] = useState(false);

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    const settingsRef = doc(db, 'settings', 'inventoryAlerts');
    const unsub = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<InventoryAlertSettings>;
          setAlertDocExists(true);
          setEmailAlertsEnabled(data.lowStockEmailEnabled !== false);
          if (typeof data.recipientEmail === 'string' && data.recipientEmail.trim()) {
            setAlertEmailInput(data.recipientEmail);
          }
        } else {
          setAlertDocExists(false);
          setEmailAlertsEnabled(true);
          setAlertEmailInput(ADMIN_EMAIL);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'settings/inventoryAlerts');
      }
    );
    return unsub;
  }, [user, isAdmin]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-900 text-white flex items-center justify-center">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Tronic World Shop Admin</h2>
        <p className="text-sm text-slate-600">
          Sign in with the store owner Google account ({ADMIN_EMAIL}) to add electronics
          components, attach photos, adjust prices, publish college project kits, and manage live
          orders.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          Sign in as Admin
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Store Admin Access Required</h2>
        <p className="text-sm text-slate-600">
          You are currently signed in as{' '}
          <span className="font-medium text-slate-900">{user.email}</span>. Inventory and price
          edits are restricted to authorized Tronic World administrators ({ADMIN_EMAIL}).
        </p>
      </div>
    );
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setProdImageUrl(compressed);
      showToast('Component photo attached and optimized.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not process image.');
    }
  };

  const handleSeedCatalog = async () => {
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      for (const p of STARTER_PRODUCTS) {
        batch.set(doc(db, 'products', p.id), {
          ...p,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const proj of STARTER_PROJECTS) {
        batch.set(doc(db, 'projects', proj.id), {
          ...proj,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      showToast('Published 14 Tronic World components and 5 college projects to Firestore.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products/projects');
    } finally {
      setSeeding(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = prodName.trim().slice(0, SCHEMA_LIMITS.PRODUCT_NAME_MAX);
    const cleanSku = (prodSku.trim() || `TW-${Date.now().toString().slice(-4)}`).slice(
      0,
      SCHEMA_LIMITS.SKU_MAX
    );
    const priceNum = Number(prodPrice);
    const stockNum = Math.max(0, Math.round(Number(prodStock) || 0));
    const cleanImageUrl = prodImageUrl.trim().slice(0, SCHEMA_LIMITS.IMAGE_URL_MAX);

    if (cleanName.length < 2 || !Number.isFinite(priceNum) || priceNum < 1) {
      showToast('Enter a valid component name and price (₹1 or more).');
      return;
    }

    setSavingProd(true);
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    const prodId = `${slug || 'comp'}-${Date.now().toString(36)}`;

    const payload: Record<string, unknown> = {
      id: prodId,
      name: cleanName,
      sku: cleanSku.toUpperCase(),
      category: prodCategory,
      price: Math.round(priceNum * 100) / 100,
      unit: (prodUnit.trim() || 'pc').slice(0, SCHEMA_LIMITS.UNIT_MAX),
      stock: stockNum,
      specs: (prodSpecs.trim() || 'Tested at Tronic World Pune').slice(0, SCHEMA_LIMITS.SPECS_MAX),
      description: (
        prodDesc.trim() || `${cleanName} available at Tronic World, Wagholi, Pune.`
      ).slice(0, SCHEMA_LIMITS.DESCRIPTION_MAX),
      imageKey: prodImageKey,
      inStock: stockNum > 0,
      featured: prodFeatured,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (cleanImageUrl) {
      payload.imageUrl = cleanImageUrl;
    }

    try {
      await setDoc(doc(db, 'products', prodId), payload);
      setProdName('');
      setProdSku('');
      setProdPrice('');
      setProdStock('20');
      setProdSpecs('');
      setProdDesc('');
      setProdImageUrl('');
      setProdFeatured(false);
      showToast(`Added "${cleanName}" at ₹${payload.price}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `products/${prodId}`);
    } finally {
      setSavingProd(false);
    }
  };

  const handleSaveInlineProduct = async (product: Product) => {
    const nextPrice = Number(editPrice);
    const nextStock = Math.max(0, Math.round(Number(editStock) || 0));
    if (!Number.isFinite(nextPrice) || nextPrice < 1) {
      showToast('Price must be at least ₹1.');
      return;
    }
    try {
      await updateDoc(doc(db, 'products', product.id), {
        price: Math.round(nextPrice * 100) / 100,
        stock: nextStock,
        inStock: nextStock > 0,
        updatedAt: serverTimestamp(),
      });
      setEditingProdId(null);
      showToast(`Updated ${product.name} to ₹${nextPrice}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${product.id}`);
    }
  };

  const handleToggleStock = async (product: Product) => {
    try {
      await updateDoc(doc(db, 'products', product.id), {
        inStock: !product.inStock,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${product.id}`);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      await deleteDoc(doc(db, 'products', product.id));
      showToast(`Removed ${product.name} from catalog.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${product.id}`);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = projTitle.trim().slice(0, SCHEMA_LIMITS.PROJECT_TITLE_MAX);
    const priceNum = Number(projPrice);
    const leadNum = Math.max(1, Math.min(30, Math.round(Number(projLeadDays) || 2)));
    const bomItems = projComponentsText
      .split(/\n|,/)
      .map((s) => s.trim().slice(0, SCHEMA_LIMITS.PROJECT_BOM_ITEM_MAX))
      .filter((s) => s.length >= 2)
      .slice(0, SCHEMA_LIMITS.PROJECT_BOM_MAX);

    if (cleanTitle.length < 3 || !Number.isFinite(priceNum) || priceNum < 100 || bomItems.length === 0) {
      showToast('Provide project title, price (≥ ₹100), and at least 1 BOM component.');
      return;
    }

    setSavingProj(true);
    const projId = `proj-${Date.now().toString(36)}`;
    try {
      await setDoc(doc(db, 'projects', projId), {
        id: projId,
        title: cleanTitle,
        domain: projDomain,
        level: projLevel,
        summary: (
          projSummary.trim() || `${cleanTitle} complete college hardware kit with wiring support.`
        ).slice(0, SCHEMA_LIMITS.DESCRIPTION_MAX),
        componentsList: bomItems,
        estimatedPrice: Math.round(priceNum),
        leadTimeDays: leadNum,
        available: true,
        imageKey: projImageKey,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setProjTitle('');
      setProjPrice('');
      setProjSummary('');
      setProjComponentsText('');
      showToast(`Added college project "${cleanTitle}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `projects/${projId}`);
    } finally {
      setSavingProj(false);
    }
  };

  const handleDeleteProject = async (project: CollegeProject) => {
    try {
      await deleteDoc(doc(db, 'projects', project.id));
      showToast(`Removed project "${project.title}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${project.id}`);
    }
  };

  const handleOrderStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    if (order.status === nextStatus) return;

    const activeStockStatuses: OrderStatus[] = ['pending', 'confirmed', 'packing', 'ready', 'completed'];
    const wasDeducted = activeStockStatuses.includes(order.status);
    const willBeDeducted = activeStockStatuses.includes(nextStatus);

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'orders', order.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      if (hasFirestoreProducts && wasDeducted !== willBeDeducted) {
        const deltaSign = willBeDeducted ? -1 : 1;
        for (const item of order.items) {
          const prod = products.find((p) => p.id === item.productId);
          if (!prod || prod.createdBy === 'starter') continue;
          const nextStock = Math.max(0, Math.min(100000, prod.stock + deltaSign * item.qty));
          batch.update(doc(db, 'products', prod.id), {
            stock: nextStock,
            inStock: nextStock > 0,
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      showToast(`Order ${order.orderNumber} marked ${nextStatus}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const persistAlertSettings = async (nextEnabled: boolean, nextEmail: string) => {
    const cleanEmail = (nextEmail.trim() || ADMIN_EMAIL).slice(0, SCHEMA_LIMITS.CUSTOMER_EMAIL_MAX);
    if (cleanEmail.length < 3 || !cleanEmail.includes('@')) {
      showToast('Enter a valid email address for low-stock alerts.');
      return;
    }

    setSavingAlertSettings(true);
    const settingsRef = doc(db, 'settings', 'inventoryAlerts');
    try {
      if (alertDocExists) {
        await updateDoc(settingsRef, {
          lowStockEmailEnabled: nextEnabled,
          recipientEmail: cleanEmail,
          lowStockThreshold: 5,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(settingsRef, {
          id: 'inventoryAlerts',
          lowStockEmailEnabled: nextEnabled,
          recipientEmail: cleanEmail,
          lowStockThreshold: 5,
          updatedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setEmailAlertsEnabled(nextEnabled);
      setAlertEmailInput(cleanEmail);
      showToast(
        nextEnabled
          ? `Automated low-stock & out-of-stock emails enabled (${cleanEmail}).`
          : 'Automated low-stock & out-of-stock email alerts turned off.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/inventoryAlerts');
    } finally {
      setSavingAlertSettings(false);
    }
  };

  const handleDeleteNonPendingOrders = async () => {
    const targets = orders.filter((o) => o.status !== 'pending');
    if (targets.length === 0) {
      setConfirmDeleteNonPending(false);
      return;
    }

    setDeletingNonPending(true);
    try {
      const CHUNK_SIZE = 450;
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const order of chunk) {
          batch.delete(doc(db, 'orders', order.id));
        }
        await batch.commit();
      }
      setConfirmDeleteNonPending(false);
      showToast(
        `Deleted ${targets.length} non-pending ${targets.length === 1 ? 'order' : 'orders'}. Pending orders remain untouched.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'orders');
    } finally {
      setDeletingNonPending(false);
    }
  };

  const pendingOrdersCount = orders.filter((o) => o.status === 'pending').length;
  const nonPendingOrders = orders.filter((o) => o.status !== 'pending');
  const lowStockProducts = products.filter((p) => !p.inStock || p.stock < 5);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Shop Admin Console</h2>
          <p className="text-sm text-slate-500">
            Signed in as {user.email} · Manage inventory, component photos, prices &amp; orders
          </p>
        </div>

        {(!hasFirestoreProducts || !hasFirestoreProjects) && (
          <button
            type="button"
            disabled={seeding}
            onClick={handleSeedCatalog}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:bg-slate-400 transition-colors whitespace-nowrap shrink-0"
          >
            <UploadCloud className="w-4 h-4 shrink-0" />
            <span>{seeding ? 'Publishing...' : 'Publish Starter Catalog to Live DB'}</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-medium text-emerald-900"
        >
          {feedback}
        </div>
      )}

      {/* Segmented Admin Tabs */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto max-w-full">
        <button
          type="button"
          onClick={() => setAdminTab('inventory')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
            adminTab === 'inventory'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Inventory ({products.length})
        </button>
        <button
          type="button"
          onClick={() => setAdminTab('projects')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
            adminTab === 'projects'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          College Projects ({projects.length})
        </button>
        <button
          type="button"
          onClick={() => setAdminTab('orders')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
            adminTab === 'orders'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Orders &amp; Analytics ({orders.length}
          {pendingOrdersCount > 0 ? ` · ${pendingOrdersCount} new` : ''})
        </button>
      </div>

      {/* Low-Stock & Out-of-Stock Email Notification Control */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              emailAlertsEnabled
                ? 'bg-orange-50 text-orange-600 border border-orange-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            {emailAlertsEnabled ? <Mail className="w-5 h-5" /> : <MailX className="w-5 h-5" />}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">
                Automated Out-of-Stock &amp; Low-Stock (&lt; 5) Email Alerts
              </h3>
              <span
                className={`text-xs font-semibold ${
                  emailAlertsEnabled ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                · {emailAlertsEnabled ? 'Active' : 'Paused'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Emails the admin whenever any component drops below 5 units or goes out of stock. You
              can turn this off anytime here.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              persistAlertSettings(emailAlertsEnabled, alertEmailInput);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="email"
              value={alertEmailInput}
              onChange={(e) => setAlertEmailInput(e.target.value)}
              maxLength={SCHEMA_LIMITS.CUSTOMER_EMAIL_MAX}
              aria-label="Admin alert email address"
              placeholder={ADMIN_EMAIL}
              className="min-h-[40px] w-52 sm:w-56 px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600"
            />
            <button
              type="submit"
              disabled={savingAlertSettings}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Save Email
            </button>
          </form>

          <button
            type="button"
            role="switch"
            aria-checked={emailAlertsEnabled}
            disabled={savingAlertSettings}
            onClick={() => persistAlertSettings(!emailAlertsEnabled, alertEmailInput)}
            className={`inline-flex items-center gap-2.5 min-h-[40px] px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              emailAlertsEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span
              className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center ${
                emailAlertsEnabled ? 'bg-emerald-600 justify-end' : 'bg-slate-400 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-sm block" />
            </span>
            <span>{emailAlertsEnabled ? 'Email Alerts On' : 'Email Alerts Off'}</span>
          </button>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <div
          role="alert"
          className="px-4 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-950"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-sm">
              Low Stock Alert: {lowStockProducts.length}{' '}
              {lowStockProducts.length === 1 ? 'component is' : 'components are'} below 5 units
            </p>
            <p className="text-amber-900">
              {lowStockProducts
                .slice(0, 5)
                .map((p) => `${p.name} (${!p.inStock || p.stock <= 0 ? '0 left' : `${p.stock} left`})`)
                .join(' · ')}
              {lowStockProducts.length > 5 ? ` · +${lowStockProducts.length - 5} more` : ''}
            </p>
          </div>
        </div>
      )}

      {adminTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Add Component Form */}
          <form
            onSubmit={handleCreateProduct}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-slate-900">
              <PackagePlus className="w-5 h-5 text-orange-600 shrink-0" />
              <h3 className="text-base font-bold">Add Component / Part</h3>
            </div>

            <div className="space-y-3">
              {/* Component Photo Preview & Upload */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-slate-700">Component Photo</span>
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  <ImageWithFallback
                    imageKey={prodImageKey}
                    imageUrl={prodImageUrl}
                    alt={prodName || 'Component preview'}
                  />
                  {prodImageUrl && (
                    <button
                      type="button"
                      onClick={() => setProdImageUrl('')}
                      aria-label="Remove uploaded photo"
                      className="absolute top-2 right-2 min-h-[32px] min-w-[32px] rounded-lg bg-white/90 text-slate-700 flex items-center justify-center border border-slate-200 hover:bg-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer flex items-center justify-center gap-1.5 transition-colors">
                    <Camera className="w-4 h-4 text-orange-600 shrink-0" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="sr-only"
                    />
                  </label>
                  <select
                    value={prodImageKey}
                    onChange={(e) => setProdImageKey(e.target.value as ImageKey)}
                    aria-label="Choose preset component photo"
                    className="flex-1 min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  >
                    <option value="arduino">Arduino Uno</option>
                    <option value="esp32">ESP32 / NodeMCU</option>
                    <option value="raspberrypi">Raspberry Pi</option>
                    <option value="hall_ultrasonic">Hall / Ultrasonic</option>
                    <option value="microcontrollers">Dev Boards</option>
                    <option value="sensors">Sensors &amp; Modules</option>
                    <option value="power">Power &amp; Relays</option>
                    <option value="robotics">Robotics Kit</option>
                    <option value="bench">Workbench</option>
                  </select>
                </div>

                <input
                  type="url"
                  value={prodImageUrl.startsWith('data:') ? '' : prodImageUrl}
                  onChange={(e) => setProdImageUrl(e.target.value)}
                  placeholder="Or paste image URL (https://...)"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Component Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={SCHEMA_LIMITS.PRODUCT_NAME_MAX}
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="e.g. Arduino Mega 2560 R3"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={500000}
                    step="1"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    placeholder="890"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Stock Qty *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={100000}
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value as ProductCategory)}
                    className="w-full min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
                  >
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    maxLength={SCHEMA_LIMITS.UNIT_MAX}
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                    placeholder="pc / pack / kit"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">SKU Code</label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.SKU_MAX}
                  value={prodSku}
                  onChange={(e) => setProdSku(e.target.value)}
                  placeholder="TW-MCU-010"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Key Specs (Single Line)
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.SPECS_MAX}
                  value={prodSpecs}
                  onChange={(e) => setProdSpecs(e.target.value)}
                  placeholder="ATmega2560 · 54 Digital I/O · 16 Analog"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  maxLength={SCHEMA_LIMITS.DESCRIPTION_MAX}
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  placeholder="Brief technical overview for students and makers..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prodFeatured}
                  onChange={(e) => setProdFeatured(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-600"
                />
                <span>Highlight on Storefront</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={savingProd}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:bg-slate-400 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{savingProd ? 'Saving...' : 'Add to Shop Catalog'}</span>
            </button>
          </form>

          {/* Live Inventory Management List */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <h3 className="text-base font-bold text-slate-900">Live Inventory &amp; Pricing</h3>
              <span className="text-xs text-slate-500">
                {hasFirestoreProducts
                  ? 'Synced with Firestore'
                  : 'Starter preview (click Publish above)'}
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {products.map((p) => {
                const isEditing = editingProdId === p.id;
                return (
                  <div
                    key={p.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                        <ImageWithFallback
                          imageKey={p.imageKey}
                          imageUrl={p.imageUrl}
                          alt={p.name}
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono-num">{p.sku}</span>
                          <span aria-hidden="true">·</span>
                          <span>{p.category}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-slate-600">
                          ₹
                          <input
                            type="number"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="ml-1 w-20 min-h-[38px] px-2 py-1 rounded-lg border border-slate-300 font-mono-num text-sm"
                          />
                        </label>
                        <label className="text-xs text-slate-600">
                          Qty
                          <input
                            type="number"
                            value={editStock}
                            onChange={(e) => setEditStock(e.target.value)}
                            className="ml-1 w-16 min-h-[38px] px-2 py-1 rounded-lg border border-slate-300 font-mono-num text-sm"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleSaveInlineProduct(p)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProdId(null)}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold font-mono-num text-slate-900 min-w-[72px] text-right">
                          ₹{p.price.toLocaleString('en-IN')}
                        </span>
                        <button
                          type="button"
                          disabled={!hasFirestoreProducts}
                          onClick={() => handleToggleStock(p)}
                          className={`min-h-[38px] px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                            !p.inStock || p.stock <= 0
                              ? 'border-rose-200 bg-rose-50 text-rose-800'
                              : p.stock < 5
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {!p.inStock || p.stock <= 0
                            ? 'Out'
                            : p.stock < 5
                              ? `Limited: ${p.stock}`
                              : `Stock: ${p.stock}`}
                        </button>
                        <button
                          type="button"
                          disabled={!hasFirestoreProducts}
                          onClick={() => {
                            setEditingProdId(p.id);
                            setEditPrice(String(p.price));
                            setEditStock(String(p.stock));
                          }}
                          aria-label={`Edit price for ${p.name}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={!hasFirestoreProducts}
                          onClick={() => handleDeleteProduct(p)}
                          aria-label={`Delete ${p.name}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {adminTab === 'projects' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateProject}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5"
          >
            <h3 className="text-base font-bold text-slate-900">Add College Project Kit</h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project Title *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.PROJECT_TITLE_MAX}
                value={projTitle}
                onChange={(e) => setProjTitle(e.target.value)}
                placeholder="e.g. Smart Helmet Accident Alert (ESP32 + GSM)"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Domain</label>
                <select
                  value={projDomain}
                  onChange={(e) => setProjDomain(e.target.value as ProjectDomain)}
                  className="w-full min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  {PROJECT_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Level</label>
                <select
                  value={projLevel}
                  onChange={(e) => setProjLevel(e.target.value as ProjectLevel)}
                  className="w-full min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  {PROJECT_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kit Price (₹) *
                </label>
                <input
                  type="number"
                  required
                  min={100}
                  max={500000}
                  value={projPrice}
                  onChange={(e) => setProjPrice(e.target.value)}
                  placeholder="1850"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Build Days
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={projLeadDays}
                  onChange={(e) => setProjLeadDays(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Photo</label>
                <select
                  value={projImageKey}
                  onChange={(e) => setProjImageKey(e.target.value as ImageKey)}
                  className="w-full min-h-[42px] px-2 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  <option value="robotics">Robotics</option>
                  <option value="esp32">ESP32 / IoT</option>
                  <option value="arduino">Arduino</option>
                  <option value="raspberrypi">Raspberry Pi</option>
                  <option value="hall_ultrasonic">Sensors</option>
                  <option value="power">Power</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bill of Materials (One item per line, max 12) *
              </label>
              <textarea
                required
                rows={4}
                value={projComponentsText}
                onChange={(e) => setProjComponentsText(e.target.value)}
                placeholder={'ESP32-WROOM-32 × 1\nMPU6050 Gyro Sensor × 1\nSIM800L GSM Module × 1'}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono-num"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Summary</label>
              <textarea
                rows={2}
                maxLength={SCHEMA_LIMITS.DESCRIPTION_MAX}
                value={projSummary}
                onChange={(e) => setProjSummary(e.target.value)}
                placeholder="What this project demonstrates for viva / evaluation..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={savingProj}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              {savingProj ? 'Publishing...' : 'Publish College Project Kit'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
            <div className="px-5 py-4">
              <h3 className="text-base font-bold text-slate-900">Active College Project Builds</h3>
            </div>
            {projects.map((proj) => (
              <div key={proj.id} className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="text-xs text-slate-500">
                    {proj.domain} · {proj.level} · {proj.leadTimeDays}d build
                  </div>
                  <p className="text-sm font-bold text-slate-900">{proj.title}</p>
                  <p className="text-xs text-slate-600">{proj.componentsList.join(' · ')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold font-mono-num text-slate-900">
                    ₹{proj.estimatedPrice.toLocaleString('en-IN')}
                  </span>
                  <button
                    type="button"
                    disabled={!hasFirestoreProjects}
                    onClick={() => handleDeleteProject(proj)}
                    aria-label={`Delete ${proj.title}`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {adminTab === 'orders' && (
        <div className="space-y-5">
          {/* Interactive Order Revenue Analytics (24h, 7d, 30d, 1y) */}
          <OrderRevenueChart orders={orders} />

          {/* Orders Action Toolbar & Bulk Delete Non-Pending Orders */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-900">Customer Orders Queue</h3>
              <p className="text-xs text-slate-500 font-mono-num tabular-nums">
                {pendingOrdersCount} pending · {nonPendingOrders.length} non-pending
              </p>
            </div>

            {confirmDeleteNonPending ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-rose-800">
                  Delete {nonPendingOrders.length} non-pending{' '}
                  {nonPendingOrders.length === 1 ? 'order' : 'orders'}? Pending orders stay kept.
                </span>
                <button
                  type="button"
                  disabled={deletingNonPending}
                  onClick={handleDeleteNonPendingOrders}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {deletingNonPending ? 'Deleting...' : 'Confirm Delete All'}
                </button>
                <button
                  type="button"
                  disabled={deletingNonPending}
                  onClick={() => setConfirmDeleteNonPending(false)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={nonPendingOrders.length === 0}
                onClick={() => setConfirmDeleteNonPending(true)}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Delete Non-Pending Orders ({nonPendingOrders.length})</span>
              </button>
            )}
          </div>

          {orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
              No customer orders have been placed yet.
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-num font-bold text-slate-900">
                        {order.orderNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-800">{order.customerName}</span>
                      <span aria-hidden="true">·</span>
                      <a
                        href={`tel:${order.customerPhone.replace(/\s+/g, '')}`}
                        className="font-mono-num text-orange-700 hover:underline font-medium"
                      >
                        {order.customerPhone}
                      </a>
                      {order.customerEmail && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-500">{order.customerEmail}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">
                        {order.fulfillmentType === 'pickup_kharadi'
                          ? 'Pickup at Wagholi'
                          : 'Pune Local Delivery'}
                      </span>
                      {order.fulfillmentType === 'delivery_pune' && `: ${order.deliveryAddress}`}{' '}
                      · Payment: {order.paymentMethod.replace(/_/g, ' ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold font-mono-num text-orange-600">
                      ₹{order.totalAmount.toLocaleString('en-IN')}
                    </span>
                    <select
                      value={order.status}
                      onChange={(e) =>
                        handleOrderStatusChange(order, e.target.value as OrderStatus)
                      }
                      aria-label={`Update status for order ${order.orderNumber}`}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                    >
                      {ORDER_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st.charAt(0).toUpperCase() + st.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-xs text-slate-700 bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1">
                  {order.items.map((item, i) => (
                    <div key={`${item.productId}_${i}`} className="flex justify-between gap-3">
                      <span>
                        {item.name} × <span className="font-mono-num">{item.qty}</span>
                      </span>
                      <span className="font-mono-num">
                        ₹{(item.price * item.qty).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                  {order.deliveryFee > 0 && (
                    <div className="flex justify-between gap-3 text-slate-500 pt-1 border-t border-slate-200/70">
                      <span>Pune Delivery Fee</span>
                      <span className="font-mono-num">₹{order.deliveryFee}</span>
                    </div>
                  )}
                  {order.collegeProjectNotes && (
                    <div className="pt-1.5 mt-1.5 border-t border-slate-200 text-slate-600">
                      Notes: {order.collegeProjectNotes}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
