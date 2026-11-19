import React, { useEffect, useState } from 'react';
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import { Product } from '../types';
import { ImageWithFallback } from './ImageWithFallback';

interface ProductModalProps {
  product: Product | null;
  cartQty: number;
  onClose: () => void;
  onAdd: (product: Product, qty: number) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  cartQty,
  onClose,
  onAdd,
}) => {
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setQty(1);
  }, [product?.id]);

  if (!product) return null;

  const availableStock = product.inStock ? Math.max(0, Math.floor(product.stock)) : 0;
  const remainingToAdd = Math.max(0, availableStock - cartQty);
  const clampedQty = remainingToAdd > 0 ? Math.min(qty, remainingToAdd) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3" />
        <div className="relative aspect-[16/10] bg-slate-100 shrink-0">
          <ImageWithFallback
            imageKey={product.imageKey}
            imageUrl={product.imageUrl}
            alt={product.name}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close component details"
            className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/90 text-slate-900 border border-slate-200 hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{product.category}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">{product.sku}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                availableStock <= 0
                  ? 'text-rose-700 font-medium'
                  : availableStock < 5
                    ? 'text-amber-700 font-semibold'
                    : 'text-emerald-700 font-medium'
              }
            >
              {availableStock <= 0
                ? 'Out of stock'
                : availableStock < 5
                  ? `Limited stock (${availableStock} left)`
                  : `${availableStock} in stock`}
            </span>
          </div>

          <h2 className="text-xl font-bold text-slate-900 leading-snug">{product.name}</h2>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono-num">
              ₹{product.price.toLocaleString('en-IN')}
            </span>
            <span className="text-sm text-slate-500">/ {product.unit}</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono-num text-slate-700">
            {product.specs || 'Standard shop tested component'}
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">{product.description}</p>

          {cartQty > 0 && (
            <p className="text-xs font-medium text-orange-700">
              Currently in cart: {cartQty} / {availableStock} {product.unit}
            </p>
          )}
        </div>

        <div className="p-4 sm:px-6 border-t border-slate-200 bg-white flex items-center gap-3">
          <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden shrink-0">
            <button
              type="button"
              disabled={clampedQty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center text-sm font-semibold font-mono-num text-slate-900">
              {clampedQty}
            </span>
            <button
              type="button"
              disabled={clampedQty >= remainingToAdd}
              onClick={() => setQty((q) => Math.min(remainingToAdd, q + 1))}
              aria-label="Increase quantity"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            disabled={availableStock <= 0 || remainingToAdd <= 0}
            onClick={() => {
              if (clampedQty <= 0) return;
              onAdd(product, clampedQty);
              onClose();
            }}
            className="flex-1 min-h-[44px] px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:bg-slate-300 disabled:text-slate-600 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span className="font-mono-num">
              {availableStock <= 0
                ? 'Out of Stock'
                : remainingToAdd <= 0
                  ? `Max Stock in Cart (${availableStock})`
                  : `Add · ₹${(product.price * clampedQty).toLocaleString('en-IN')}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
