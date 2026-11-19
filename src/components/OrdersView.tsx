import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Clock, PackageCheck, XCircle } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Order, OrderStatus } from '../types';

interface OrdersViewProps {
  user: User | null;
  orders: Order[];
  loading: boolean;
  onSignIn: () => Promise<void>;
  onBrowseCatalog: () => void;
}

const STATUS_META: Record<
  OrderStatus,
  { label: string; colorClass: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Pending Shop Confirmation',
    colorClass: 'text-amber-800 bg-amber-50 border-amber-200',
    icon: <Clock className="w-4 h-4 shrink-0" />,
  },
  confirmed: {
    label: 'Confirmed by Tronic World',
    colorClass: 'text-sky-800 bg-sky-50 border-sky-200',
    icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
  },
  packing: {
    label: 'Packing Components',
    colorClass: 'text-indigo-800 bg-indigo-50 border-indigo-200',
    icon: <PackageCheck className="w-4 h-4 shrink-0" />,
  },
  ready: {
    label: 'Ready for Pickup / Dispatch',
    colorClass: 'text-emerald-800 bg-emerald-50 border-emerald-200',
    icon: <PackageCheck className="w-4 h-4 shrink-0" />,
  },
  completed: {
    label: 'Completed',
    colorClass: 'text-slate-700 bg-slate-100 border-slate-200',
    icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
  },
  cancelled: {
    label: 'Cancelled',
    colorClass: 'text-rose-800 bg-rose-50 border-rose-200',
    icon: <XCircle className="w-4 h-4 shrink-0" />,
  },
};

export const OrdersView: React.FC<OrdersViewProps> = ({
  user,
  orders,
  loading,
  onSignIn,
  onBrowseCatalog,
}) => {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancelOrder = async (order: Order) => {
    if (!user || order.status !== 'pending') return;
    setCancellingId(order.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setCancellingId(null);
    }
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Your Tronic World Orders</h2>
        <p className="text-sm text-slate-600">
          Sign in with Google to view your component orders, college project kit bookings, and live
          pickup status from our Wagholi shop.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 space-y-4">
        {[1, 2].map((n) => (
          <div key={n} className="h-36 rounded-2xl bg-white border border-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">No orders placed yet</h2>
        <p className="text-sm text-slate-600">
          Select microcontrollers, sensors, or college project kits from the catalog to calculate
          total costs and place your first order.
        </p>
        <button
          type="button"
          onClick={onBrowseCatalog}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors"
        >
          Explore Components
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">My Orders</h2>
          <p className="text-sm text-slate-500">
            Real-time status updates from Tronic World, Wagholi, Pune - Nagar Rd
          </p>
        </div>
        <span className="text-sm font-mono-num text-slate-600">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'}
        </span>
      </div>

      <div className="space-y-4">
        {orders.map((order) => {
          const meta = STATUS_META[order.status] || STATUS_META.pending;
          return (
            <article
              key={order.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono-num font-semibold text-slate-900">
                      {order.orderNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {order.fulfillmentType === 'pickup_kharadi'
                        ? 'Wagholi Shop Pickup'
                        : 'Pune Local Delivery'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{order.deliveryAddress}</p>
                </div>

                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${meta.colorClass}`}
                >
                  {meta.icon}
                  <span>{meta.label}</span>
                </div>
              </div>

              <ul className="divide-y divide-slate-100 border-t border-b border-slate-100 text-sm">
                {order.items.map((item, idx) => (
                  <li key={`${item.productId}_${idx}`} className="py-2 flex justify-between gap-3">
                    <span className="text-slate-700">
                      {item.name} × <span className="font-mono-num">{item.qty}</span>
                    </span>
                    <span className="font-mono-num text-slate-900 shrink-0">
                      ₹{(item.price * item.qty).toLocaleString('en-IN')}
                    </span>
                  </li>
                ))}
              </ul>

              {order.collegeProjectNotes && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  Project Notes: {order.collegeProjectNotes}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="text-slate-500">Total: </span>
                  <span className="font-bold font-mono-num text-slate-900">
                    ₹{order.totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>

                {order.status === 'pending' && (
                  <button
                    type="button"
                    disabled={cancellingId === order.id}
                    onClick={() => handleCancelOrder(order)}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 transition-colors"
                  >
                    {cancellingId === order.id ? 'Cancelling...' : 'Cancel Order'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
