import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
} from 'lucide-react';
import { STORE_INFO } from '../data/starterCatalog';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CartItem,
  FREE_DELIVERY_THRESHOLD,
  FulfillmentType,
  Order,
  PaymentMethod,
  Product,
  PUNE_DELIVERY_FEE,
  SCHEMA_LIMITS,
  UserProfile,
} from '../types';
import { ImageWithFallback } from './ImageWithFallback';

interface CartViewProps {
  items: CartItem[];
  products: Product[];
  user: User | null;
  profile: UserProfile | null;
  onSignIn: () => Promise<void>;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onClearCart: () => void;
  onOrderSuccess: (order: Order) => void;
  onViewOrders: () => void;
  onCloseDrawer?: () => void;
}

export const CartView: React.FC<CartViewProps> = ({
  items,
  products,
  user,
  profile,
  onSignIn,
  onUpdateQty,
  onRemove,
  onClearCart,
  onOrderSuccess,
  onViewOrders,
  onCloseDrawer,
}) => {
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'confirm'>('cart');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('pickup_kharadi');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_at_shop');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [collegeProjectNotes, setCollegeProjectNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (items.length === 0 && !confirmedOrder) {
      setCheckoutStep('cart');
      setFormError(null);
    }
  }, [items.length, confirmedOrder]);

  useEffect(() => {
    if (user && !customerName) {
      setCustomerName(user.displayName || '');
    }
  }, [user, customerName]);

  useEffect(() => {
    if (profile) {
      if (!customerPhone && profile.phone) setCustomerPhone(profile.phone);
      if (!deliveryAddress && profile.defaultAddress) setDeliveryAddress(profile.defaultAddress);
      if (!customerName && profile.displayName) setCustomerName(profile.displayName);
    }
  }, [profile, customerPhone, deliveryAddress, customerName]);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const deliveryFee =
    items.length === 0 || fulfillmentType === 'pickup_kharadi' || subtotal >= FREE_DELIVERY_THRESHOLD
      ? 0
      : PUNE_DELIVERY_FEE;
  const totalAmount = subtotal + deliveryFee;
  const totalUnits = items.reduce((sum, item) => sum + item.qty, 0);

  const handleFulfillmentChange = (next: FulfillmentType) => {
    setFulfillmentType(next);
    if (next === 'pickup_kharadi') {
      setPaymentMethod('pay_at_shop');
    } else if (paymentMethod === 'pay_at_shop') {
      setPaymentMethod('cod_pune');
    }
  };

  const getLiveMaxStock = (item: CartItem): number => {
    if (item.isProjectKit) return 20;
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return 999;
    if (!prod.inStock) return 0;
    return Math.max(0, Math.floor(prod.stock));
  };

  const findStockIssue = (): string | null => {
    for (const item of items) {
      if (item.isProjectKit) continue;
      const prod = products.find((p) => p.id === item.productId);
      if (!prod) continue;
      const available = prod.inStock ? Math.max(0, Math.floor(prod.stock)) : 0;
      if (available <= 0) {
        return `"${item.name}" is currently out of stock. Please remove it before ordering.`;
      }
      if (item.qty > available) {
        return `Only ${available} units of "${item.name}" available in stock. Please reduce quantity to ${available} or less.`;
      }
    }
    return null;
  };

  const handleProceedToConfirm = () => {
    setFormError(null);
    if (items.length === 0) return;
    const stockIssue = findStockIssue();
    if (stockIssue) {
      setFormError(stockIssue);
      return;
    }
    setCheckoutStep('confirm');
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!user) {
      await onSignIn();
      return;
    }

    const cleanName = customerName.trim().slice(0, SCHEMA_LIMITS.CUSTOMER_NAME_MAX);
    const cleanPhone = customerPhone.trim().slice(0, SCHEMA_LIMITS.CUSTOMER_PHONE_MAX);
    const cleanAddress = deliveryAddress.trim().slice(0, SCHEMA_LIMITS.ADDRESS_MAX);
    const cleanNotes = collegeProjectNotes.trim().slice(0, SCHEMA_LIMITS.PROJECT_NOTES_MAX);

    if (cleanName.length < 2) {
      setFormError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (cleanPhone.length < 8) {
      setFormError('Please enter a valid 10-digit mobile number for order confirmation.');
      return;
    }
    if (fulfillmentType === 'delivery_pune' && cleanAddress.length < 6) {
      setFormError('Please enter your Pune delivery address (Wagholi / Kharadi / nearby).');
      return;
    }
    if (items.length === 0) {
      setFormError('Your cart is empty.');
      return;
    }
    if (items.length > SCHEMA_LIMITS.ORDER_ITEMS_MAX) {
      setFormError(`Maximum ${SCHEMA_LIMITS.ORDER_ITEMS_MAX} distinct line items per order.`);
      return;
    }
    const stockIssue = findStockIssue();
    if (stockIssue) {
      setFormError(stockIssue);
      return;
    }

    setSubmitting(true);
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const orderNumber = `TW-${String(Date.now()).slice(-6)}`;

    const sanitizedItems = items.slice(0, SCHEMA_LIMITS.ORDER_ITEMS_MAX).map((item) => ({
      productId: item.productId.slice(0, SCHEMA_LIMITS.ID_MAX),
      name: item.name.slice(0, 140),
      sku: (item.sku || 'TW-ITEM').slice(0, 40),
      unit: (item.unit || 'pc').slice(0, 32),
      qty: Math.max(1, Math.min(getLiveMaxStock(item), Math.round(item.qty))),
      price: Math.max(1, Math.round(item.price)),
    }));

    const computedSubtotal = sanitizedItems.reduce((s, i) => s + i.price * i.qty, 0);
    const computedDelivery =
      fulfillmentType === 'pickup_kharadi' || computedSubtotal >= FREE_DELIVERY_THRESHOLD
        ? 0
        : PUNE_DELIVERY_FEE;
    const computedTotal = computedSubtotal + computedDelivery;

    const payload = {
      id: orderId,
      orderNumber,
      userId: user.uid,
      customerName: cleanName,
      customerPhone: cleanPhone,
      customerEmail: (user.email || '').slice(0, SCHEMA_LIMITS.CUSTOMER_EMAIL_MAX),
      fulfillmentType,
      deliveryAddress:
        fulfillmentType === 'pickup_kharadi'
          ? `Pickup at ${STORE_INFO.address}`
          : cleanAddress,
      collegeProjectNotes: cleanNotes,
      items: sanitizedItems,
      subtotal: computedSubtotal,
      deliveryFee: computedDelivery,
      totalAmount: computedTotal,
      paymentMethod,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const orderableItems = items.slice(0, SCHEMA_LIMITS.ORDER_ITEMS_MAX);
    const productQtyTotals = new Map<string, { name: string; qty: number }>();
    for (const item of orderableItems) {
      if (item.isProjectKit) continue;
      const existingEntry = productQtyTotals.get(item.productId);
      const itemQty = Math.max(1, Math.min(getLiveMaxStock(item), Math.round(item.qty)));
      if (existingEntry) {
        existingEntry.qty += itemQty;
      } else {
        productQtyTotals.set(item.productId, { name: item.name, qty: itemQty });
      }
    }

    class StockConflictError extends Error {}

    try {
      await runTransaction(db, async (tx) => {
        const stockUpdates: Array<{
          productId: string;
          nextStock: number;
        }> = [];

        for (const [productId, reqItem] of productQtyTotals.entries()) {
          const prodRef = doc(db, 'products', productId);
          const prodSnap = await tx.get(prodRef);
          if (!prodSnap.exists()) {
            continue;
          }
          const prodData = prodSnap.data() as {
            stock?: unknown;
            inStock?: unknown;
          };
          const liveAvailable = prodData.inStock
            ? Math.max(0, Math.floor(Number(prodData.stock) || 0))
            : 0;
          if (liveAvailable <= 0) {
            throw new StockConflictError(
              `"${reqItem.name}" is now out of stock. Please remove it from your cart.`
            );
          }
          if (reqItem.qty > liveAvailable) {
            throw new StockConflictError(
              `Only ${liveAvailable} units of "${reqItem.name}" left in stock. Please reduce quantity to ${liveAvailable} or less.`
            );
          }
          stockUpdates.push({
            productId,
            nextStock: Math.max(0, liveAvailable - reqItem.qty),
          });
        }

        tx.set(doc(db, 'orders', orderId), payload);

        for (const upd of stockUpdates) {
          tx.update(doc(db, 'products', upd.productId), {
            stock: upd.nextStock,
            inStock: upd.nextStock > 0,
            lastOrderId: orderId,
            updatedAt: serverTimestamp(),
          });
        }
      });

      // Save customer phone/address defaults silently for next order
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          displayName: cleanName,
          phone: cleanPhone,
          defaultAddress:
            fulfillmentType === 'delivery_pune'
              ? cleanAddress
              : profile?.defaultAddress || '',
          collegeName: profile?.collegeName || '',
          createdAt: profile?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const confirmed: Order = {
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setConfirmedOrder(confirmed);
      setCheckoutStep('cart');
      onOrderSuccess(confirmed);
      onClearCart();
    } catch (err) {
      if (err instanceof StockConflictError) {
        setFormError(err.message);
        setCheckoutStep('cart');
        return;
      }
      handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedOrder) {
    const isWagholiPickup = confirmedOrder.fulfillmentType === 'pickup_kharadi';

    return (
      <div className="p-5 sm:p-6 space-y-5 overflow-y-auto h-full">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-800">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <h3 className="text-lg font-bold">
              Order {confirmedOrder.orderNumber} Confirmed
            </h3>
          </div>

          {isWagholiPickup ? (
            <div className="space-y-2.5">
              <p className="text-base font-bold text-emerald-950">
                Order placed now you can collect from the store.
              </p>
              <div className="bg-white/90 border border-emerald-200 rounded-xl p-3 space-y-1.5 text-xs text-slate-700">
                <div className="flex items-start gap-2 font-semibold text-slate-900">
                  <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                  <span>{STORE_INFO.address}</span>
                </div>
                <p className="text-slate-600 pl-6">
                  {STORE_INFO.hoursDaily} · {STORE_INFO.hoursWed}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-emerald-950">
                Thank you, {confirmedOrder.customerName}. Your Pune local delivery order details have
                been sent to the Tronic World admin.
              </p>
              <div className="bg-white border border-emerald-200 rounded-xl p-3.5 space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Admin Contact Number for Delivery Coordination
                </p>
                <a
                  href={`tel:${STORE_INFO.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold font-mono-num hover:bg-slate-800 transition-colors"
                >
                  <Phone className="w-4 h-4 text-orange-400 shrink-0" />
                  <span>{STORE_INFO.phone}</span>
                </a>
                <p className="text-xs text-slate-500">
                  Call or WhatsApp Tronic World Admin on {STORE_INFO.phone} for Pune delivery dispatch
                  updates.
                </p>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between text-sm">
            <span className="text-emerald-800">Total Payable</span>
            <span className="font-bold font-mono-num text-emerald-950">
              ₹{confirmedOrder.totalAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">Order Details Sent to Admin</h4>
            <span className="text-xs font-mono-num text-slate-500">
              {confirmedOrder.customerPhone}
            </span>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {confirmedOrder.items.map((item) => (
              <li key={item.productId} className="py-2 flex items-center justify-between gap-3">
                <span className="text-slate-700 truncate">
                  {item.name} × {item.qty}
                </span>
                <span className="font-mono-num text-slate-900 shrink-0">
                  ₹{(item.price * item.qty).toLocaleString('en-IN')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 pt-1">
            {isWagholiPickup
              ? `Pickup: ${STORE_INFO.address}`
              : `Delivery to: ${confirmedOrder.deliveryAddress}`}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => {
              setConfirmedOrder(null);
              onViewOrders();
              onCloseDrawer?.();
            }}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Track My Orders
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmedOrder(null);
              onCloseDrawer?.();
            }}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
          <ShoppingBag className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900">Your component cart is empty</h3>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">
            Add microcontrollers, sensors, or complete college project kits to calculate total cost
            and order directly.
          </p>
        </div>
        {onCloseDrawer && (
          <button
            type="button"
            onClick={onCloseDrawer}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Browse Components
          </button>
        )}
      </div>
    );
  }

  if (checkoutStep === 'cart') {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto">
          {/* Itemized BOM List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Selected Parts ({totalUnits} {totalUnits === 1 ? 'unit' : 'units'})
              </h3>
              <button
                type="button"
                onClick={onClearCart}
                className="text-xs font-medium text-slate-500 hover:text-rose-700 py-1 px-2"
              >
                Clear All
              </button>
            </div>

            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-2xl bg-white overflow-hidden">
              {items.map((item) => {
                const maxStock = getLiveMaxStock(item);
                const overStock = item.qty > maxStock;
                return (
                  <li key={item.productId} className="p-3.5 flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                      <ImageWithFallback
                        imageKey={item.imageKey}
                        imageUrl={item.imageUrl}
                        alt={item.name}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500 font-mono-num">
                        ₹{item.price.toLocaleString('en-IN')} / {item.unit}
                        {!item.isProjectKit && (
                          <span
                            className={
                              maxStock <= 0
                                ? ' text-rose-700 font-semibold'
                                : maxStock < 5
                                  ? ' text-amber-700 font-semibold'
                                  : ''
                            }
                          >
                            {' '}
                            ·{' '}
                            {maxStock <= 0
                              ? 'Out of stock'
                              : maxStock < 5
                                ? `Limited stock (${maxStock} left)`
                                : `${maxStock} in stock`}
                          </span>
                        )}
                      </p>
                      {overStock && (
                        <p className="text-[11px] font-medium text-rose-700">
                          {maxStock > 0
                            ? `Only ${maxStock} left in stock`
                            : 'Currently out of stock'}
                          {' · '}
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.productId, maxStock)}
                            className="underline font-semibold"
                          >
                            {maxStock > 0 ? `Set to ${maxStock}` : 'Remove'}
                          </button>
                        </p>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.productId, item.qty - 1)}
                            aria-label={`Decrease quantity for ${item.name}`}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-100"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-xs font-semibold font-mono-num text-slate-900">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            disabled={item.qty >= maxStock}
                            onClick={() => onUpdateQty(item.productId, item.qty + 1)}
                            aria-label={`Increase quantity for ${item.name}`}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemove(item.productId)}
                          aria-label={`Remove ${item.name}`}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold font-mono-num text-slate-900">
                        ₹{(item.price * item.qty).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Live Cost Calculator & Fulfillment Selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Cost Calculator &amp; Fulfillment</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleFulfillmentChange('pickup_kharadi')}
                className={`min-h-[52px] p-3 rounded-xl border text-left transition-colors flex items-start gap-2.5 ${
                  fulfillmentType === 'pickup_kharadi'
                    ? 'border-orange-600 bg-orange-50/70 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Store className="w-4 h-4 mt-0.5 shrink-0 text-orange-600" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900">Pickup at Wagholi</div>
                  <div className="text-xs text-slate-500 font-mono-num">₹0 · Collect at store</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleFulfillmentChange('delivery_pune')}
                className={`min-h-[52px] p-3 rounded-xl border text-left transition-colors flex items-start gap-2.5 ${
                  fulfillmentType === 'delivery_pune'
                    ? 'border-orange-600 bg-orange-50/70 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Truck className="w-4 h-4 mt-0.5 shrink-0 text-orange-600" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900">Pune Local Delivery</div>
                  <div className="text-xs text-slate-500 font-mono-num">
                    {subtotal >= FREE_DELIVERY_THRESHOLD
                      ? 'Free over ₹1,500'
                      : `₹${PUNE_DELIVERY_FEE} (Free ≥ ₹1,500)`}
                  </div>
                </div>
              </button>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Components Subtotal</span>
                <span className="font-mono-num text-slate-900">
                  ₹{subtotal.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>
                  {fulfillmentType === 'pickup_kharadi' ? 'Wagholi Store Pickup' : 'Pune Delivery Fee'}
                </span>
                <span className="font-mono-num text-slate-900">
                  {deliveryFee === 0 ? 'Free' : `₹${deliveryFee}`}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-bold text-slate-900">
                <span>Grand Total</span>
                <span className="font-mono-num text-orange-600">
                  ₹{totalAmount.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:px-6 border-t border-slate-200 bg-white shrink-0 space-y-2.5">
          {formError && (
            <p
              role="alert"
              className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2"
            >
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={handleProceedToConfirm}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
          >
            <span>Proceed</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">₹{totalAmount.toLocaleString('en-IN')}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 sm:p-6 space-y-5 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setCheckoutStep('cart');
            }}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Cart</span>
          </button>
          <span className="text-xs font-medium text-slate-500">Step 2 of 2 · Confirm Order</span>
        </div>

        {/* Order Summary sent to Admin */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {fulfillmentType === 'pickup_kharadi' ? 'Pickup at Wagholi' : 'Pune Local Delivery'}
            </h3>
            <span className="text-sm font-bold font-mono-num text-orange-600">
              ₹{totalAmount.toLocaleString('en-IN')}
            </span>
          </div>

          <ul className="divide-y divide-slate-100 text-xs text-slate-700 max-h-36 overflow-y-auto border-t border-slate-100 pt-1">
            {items.map((item) => (
              <li key={item.productId} className="py-1.5 flex items-center justify-between gap-3">
                <span className="truncate">
                  {item.name} × <span className="font-mono-num">{item.qty}</span>
                </span>
                <span className="font-mono-num text-slate-900 shrink-0">
                  ₹{(item.price * item.qty).toLocaleString('en-IN')}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>
              {totalUnits} {totalUnits === 1 ? 'unit' : 'units'} ·{' '}
              {deliveryFee === 0 ? 'Free Pickup / Delivery' : `Includes ₹${deliveryFee} delivery`}
            </span>
            <button
              type="button"
              onClick={() => setCheckoutStep('cart')}
              className="font-semibold text-orange-600 hover:text-orange-700"
            >
              Change
            </button>
          </div>
        </div>

        {/* Customer Details & Confirm Order Form */}
        <form id="tronic-checkout-form" onSubmit={handleSubmitOrder} className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Customer &amp; Order Details</h3>
              {user && (
                <span className="text-xs text-slate-500 truncate max-w-[180px]">{user.email}</span>
              )}
            </div>

            {!user ? (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-xs text-slate-600">
                  Sign in with Google so Tronic World Admin receives your order details and you can
                  track pickup or Pune delivery status.
                </p>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                >
                  Sign in with Google to Confirm Order
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={SCHEMA_LIMITS.CUSTOMER_NAME_MAX}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Aarav Deshmukh"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={SCHEMA_LIMITS.CUSTOMER_PHONE_MAX}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+91 98XXXXXXXX"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 font-mono-num focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  </div>
                </div>

                {fulfillmentType === 'delivery_pune' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-700">
                      Pune Delivery Address (Wagholi / Kharadi / Nearby) *
                    </label>
                    <textarea
                      required
                      rows={2}
                      maxLength={SCHEMA_LIMITS.ADDRESS_MAX}
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Flat / Hostel / College Dept, Area, Pune Pincode"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                    <span>Collect from {STORE_INFO.address}.</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Preference
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  >
                    {fulfillmentType === 'pickup_kharadi' && (
                      <option value="pay_at_shop">Pay at Wagholi Shop Counter (Cash / UPI)</option>
                    )}
                    <option value="upi_on_delivery">UPI on Pickup / Delivery</option>
                    <option value="cod_pune">Cash on Delivery (Pune)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    College Project / Custom Assembly Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={SCHEMA_LIMITS.PROJECT_NOTES_MAX}
                    value={collegeProjectNotes}
                    onChange={(e) => setCollegeProjectNotes(e.target.value)}
                    placeholder="e.g. Solder header pins on Nano, or Diploma Sem 6 IoT project kit"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600"
                  />
                </div>
              </>
            )}

            {formError && (
              <p
                role="alert"
                className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2"
              >
                {formError}
              </p>
            )}
          </div>
        </form>
      </div>

      {user && (
        <div className="p-4 sm:px-6 border-t border-slate-200 bg-white shrink-0">
          <button
            type="submit"
            form="tronic-checkout-form"
            disabled={submitting}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:bg-slate-300 transition-colors flex items-center justify-center gap-2"
          >
            <span>{submitting ? 'Confirming Order...' : 'Confirm Order'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">₹{totalAmount.toLocaleString('en-IN')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
