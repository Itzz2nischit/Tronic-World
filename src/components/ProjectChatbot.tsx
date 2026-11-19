import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Phone,
  Plus,
  RotateCcw,
  Send,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { STORE_INFO } from '../data/starterCatalog';
import { ChatMaterialItem, ChatMessage, Product } from '../types';

interface ProjectChatbotProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onAddProduct: (product: Product, qty: number) => void;
  getCartQty: (productId: string) => number;
  onOpenCart: () => void;
}

const STARTER_PROMPTS = [
  'Difference between ESP32 and Arduino Uno for IoT?',
  'How do I wire an HC-SR04 ultrasonic sensor safely?',
  'What components do I need for a self-parking car?',
  'Which resistor value should I use for an LED on 5V?',
];

function buildHistorySummaryText(msg: ChatMessage): string {
  if (msg.role === 'user' || !msg.materials || msg.materials.length === 0) {
    return msg.text;
  }
  const bomSummary = msg.materials
    .map((m) => `- ${m.qty}x ${m.name} (${m.purpose})`)
    .join('\n');
  return `${msg.text}\n\nRecommended Materials:\n${bomSummary}`;
}

export const ProjectChatbot: React.FC<ProjectChatbotProps> = ({
  open,
  onClose,
  products,
  messages,
  setMessages,
  onAddProduct,
  getCartQty,
  onOpenCart,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open, messages.length, loading]);

  if (!open) return null;

  const productById = new Map<string, Product>();
  for (const p of products) {
    productById.set(p.id, p);
    productById.set(p.id.toLowerCase(), p);
    if (p.sku) {
      productById.set(p.sku.toLowerCase(), p);
    }
  }

  const findCatalogProduct = (catalogProductId: string): Product | undefined => {
    const key = catalogProductId.trim();
    if (!key) return undefined;
    return productById.get(key) || productById.get(key.toLowerCase());
  };

  const sendPrompt = async (promptText: string, appendUserBubble = true) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;

    setError(null);
    setLastFailedPrompt(null);

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: trimmed,
    };

    const baseMessages =
      appendUserBubble && messages.length > 0 && messages[messages.length - 1].role === 'user'
        ? messages.slice(0, -1)
        : messages;

    const nextMessages = appendUserBubble ? [...baseMessages, userMsg] : baseMessages;
    if (appendUserBubble) {
      setMessages(nextMessages);
      setInput('');
    }

    setLoading(true);

    try {
      const apiMessages = nextMessages.map((m) => ({
        role: m.role,
        text: buildHistorySummaryText(m),
      }));

      const catalogSummary = products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        unit: p.unit,
        inStock: p.inStock,
        stock: p.stock,
        specs: p.specs,
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      let res: Response;
      try {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: apiMessages,
            catalog: catalogSummary,
          }),
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        materials?: ChatMaterialItem[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const botMsg: ChatMessage = {
        id: `model_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'model',
        text: data.reply || 'Here is the answer to your electronics question.',
        materials: Array.isArray(data.materials) ? data.materials : [],
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'Gemini took too long to respond. Please tap Retry.'
          : err instanceof Error
            ? err.message
            : 'Unable to connect to Gemini Bot.';
      setError(msg);
      setLastFailedPrompt(trimmed);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(input, true);
  };

  const handleReset = () => {
    if (loading) return;
    setMessages([]);
    setError(null);
    setLastFailedPrompt(null);
    setInput('');
  };

  const handleAddMatchedMaterials = (materials: ChatMaterialItem[]) => {
    for (const item of materials) {
      if (!item.catalogProductId) continue;
      const matched = findCatalogProduct(item.catalogProductId);
      if (matched && matched.inStock && matched.stock > 0) {
        onAddProduct(matched, Math.max(1, item.qty));
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        aria-label="Gemini Electronics Bot"
        className="w-full md:max-w-xl bg-slate-50 h-full border-l border-slate-200 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-orange-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">Gemini Bot</h2>
              <p className="text-xs text-slate-500 truncate">
                Ask anything about electronics, circuits &amp; components
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                aria-label="Start new chat"
                title="New Chat"
                className="inline-flex items-center gap-1 min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close project advisor"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Welcome System Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-1.5 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">
                  Hi! Ask Gemini Bot any electronics or component question.
                </p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Ask about microcontrollers, sensors, pinouts, resistor/power calculations,
                  troubleshooting, or full project component lists — and add matching stocked parts
                  straight to your cart.
                </p>
              </div>
            </div>

            {messages.length === 0 && (
              <div className="pt-1 flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={loading}
                    onClick={() => void sendPrompt(prompt, true)}
                    className="text-left text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 hover:border-orange-500 hover:bg-orange-50/60 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conversation History */}
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] bg-slate-900 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
                    {msg.text}
                  </div>
                </div>
              );
            }

            const materials = msg.materials ?? [];
            const matchedInStock = materials.filter((m) => {
              const p = m.catalogProductId ? findCatalogProduct(m.catalogProductId) : undefined;
              return Boolean(p && p.inStock && p.stock > 0);
            });

            return (
              <div key={msg.id} className="space-y-3">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 space-y-4">
                  <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                    {msg.text}
                  </div>

                  {materials.length > 0 && (
                    <div className="border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
                      <div className="px-3.5 py-2.5 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Required Materials ({materials.length})
                        </span>
                        {matchedInStock.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleAddMatchedMaterials(materials)}
                            className="inline-flex items-center gap-1.5 min-h-[32px] px-3 py-1 rounded-lg bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 transition-colors"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Add {matchedInStock.length} Stocked Parts</span>
                          </button>
                        )}
                      </div>

                      <ul className="divide-y divide-slate-200">
                        {materials.map((mat, idx) => {
                          const matched = mat.catalogProductId
                            ? findCatalogProduct(mat.catalogProductId)
                            : undefined;
                          const canBuy = Boolean(matched && matched.inStock && matched.stock > 0);
                          const inCartQty = matched ? getCartQty(matched.id) : 0;

                          return (
                            <li
                              key={`${mat.name}_${idx}`}
                              className="p-3 flex items-start justify-between gap-3 bg-white"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-xs font-bold text-slate-900">
                                  <span className="font-mono-num text-orange-600 mr-1.5">
                                    {mat.qty}×
                                  </span>
                                  <span>{mat.name}</span>
                                </p>
                                {mat.purpose && (
                                  <p className="text-xs text-slate-600 leading-snug">
                                    {mat.purpose}
                                  </p>
                                )}
                                {matched ? (
                                  <p
                                    className={`text-[11px] font-mono-num pt-0.5 ${
                                      !canBuy
                                        ? 'text-rose-700 font-medium'
                                        : matched.stock < 5
                                          ? 'text-amber-700 font-semibold'
                                          : 'text-slate-500'
                                    }`}
                                  >
                                    Tronic World: ₹{matched.price.toLocaleString('en-IN')} /{' '}
                                    {matched.unit} ·{' '}
                                    {!canBuy
                                      ? 'Out of stock'
                                      : matched.stock < 5
                                        ? `Limited stock (${matched.stock} left)`
                                        : `${matched.stock} in stock`}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-slate-500 pt-0.5">
                                    Custom / store counter item · Ask on {STORE_INFO.phone}
                                  </p>
                                )}
                              </div>

                              {matched && canBuy && (
                                <button
                                  type="button"
                                  disabled={inCartQty >= matched.stock}
                                  onClick={() => onAddProduct(matched, mat.qty)}
                                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1 transition-colors ${
                                    inCartQty >= matched.stock
                                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 cursor-default'
                                      : inCartQty > 0
                                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                        : 'bg-slate-900 text-white hover:bg-orange-600'
                                  }`}
                                >
                                  {inCartQty >= matched.stock ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Max in Cart ({inCartQty})</span>
                                    </>
                                  ) : inCartQty > 0 ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      <span>In Cart ({inCartQty})</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>
                                        Add · ₹
                                        {(
                                          matched.price * Math.min(matched.stock, Math.max(1, mat.qty))
                                        ).toLocaleString('en-IN')}
                                      </span>
                                    </>
                                  )}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {matchedInStock.length > 0 && (
                        <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
                          <span className="text-slate-600">
                            Ready to calculate total &amp; order?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenCart();
                            }}
                            className="font-semibold text-orange-600 hover:text-orange-700"
                          >
                            Open Cart
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 inline-flex items-center gap-2.5 text-xs font-medium text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-orange-600 shrink-0" />
              <span>Gemini is answering your question...</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-800 flex items-center justify-between gap-3"
            >
              <span>{error}</span>
              {lastFailedPrompt && (
                <button
                  type="button"
                  onClick={() => void sendPrompt(lastFailedPrompt, false)}
                  className="px-3 py-1.5 rounded-lg bg-rose-700 text-white font-semibold shrink-0 hover:bg-rose-800"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        {/* Sticky Input Bar */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 pb-safe shrink-0 space-y-2">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              maxLength={800}
              placeholder="Ask about components, circuits, pinouts, or projects..."
              aria-label="Ask Gemini electronics and components question"
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-600 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
              aria-label="Send message"
              className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors inline-flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Ask</span>
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>Powered by Gemini · Keeps conversation context</span>
            <a
              href={`tel:${STORE_INFO.phone.replace(/\s+/g, '')}`}
              className="inline-flex items-center gap-1 font-mono-num font-medium text-slate-700 hover:text-orange-600"
            >
              <Phone className="w-3 h-3" />
              <span>{STORE_INFO.phone}</span>
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
};
