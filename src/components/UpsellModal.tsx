import React from 'react';
import { X, Lock, Flame, Sparkles } from 'lucide-react';
import { PRODUCT_BASE_PRICE } from '../data/landingData';

interface UpsellModalProps {
  isOpen: boolean;
  quantity: number;
  onClose: () => void;
  onSelectOption: (includeCream: boolean) => void;
}

export const UpsellModal: React.FC<UpsellModalProps> = ({
  isOpen,
  quantity,
  onClose,
  onSelectOption,
}) => {
  if (!isOpen) return null;

  const orderTotalFormatted = (quantity * PRODUCT_BASE_PRICE).toFixed(2).replace('.', ',');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      {/* Click outside to close */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Responsive Modal Container - dynamically adapts to viewport height and width */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md max-h-[94vh] max-h-[94dvh] overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-2xl transition-all flex flex-col justify-between">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" /> Complemente seu pedido
              </span>
              <h3 className="font-display text-base sm:text-lg font-black text-foreground leading-tight">
                Deseja adicionar o Clareador?
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Pedido atual: <strong className="text-foreground">{quantity}x Kit Depilador</strong> (R$ {orderTotalFormatted})
          </p>
        </div>

        {/* Super Offer Card - Responsive & Large Image Display */}
        <div className="my-2.5 overflow-hidden rounded-2xl border-2 border-primary bg-card shadow-md">
          {/* Header Badge */}
          <div className="cta-grad px-3 py-1 flex items-center justify-center gap-1.5 text-center text-[11px] font-black uppercase tracking-wider text-primary-foreground">
            <Flame className="h-3.5 w-3.5 fill-white shrink-0" />
            SUPER OFERTA · 40% OFF
          </div>

          <div className="p-3 sm:p-4 flex flex-col items-center text-center">
            {/* Prominent, Responsive Image that scales with phone height */}
            <div className="relative w-full max-w-[260px] h-[26vh] max-h-56 min-h-36 rounded-xl bg-white p-1.5 flex items-center justify-center border border-border/80 shadow-sm">
              <img
                src="/images/clareador-promo.jpg"
                alt="Creme Clareador Íntimo e Corporal Clear Beauty"
                className="w-full h-full object-contain select-none"
              />
              <span className="absolute top-2 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black text-white shadow-sm">
                40% OFF
              </span>
            </div>

            {/* Product Details & Price */}
            <div className="mt-2 w-full">
              <p className="font-display text-sm sm:text-base font-black text-foreground">
                Clareador Clear Beauty
              </p>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2">
                Clareia e uniformiza axilas, virilha e áreas escuras.
              </p>

              {/* Price Callout */}
              <div className="mt-2 flex items-center justify-center gap-2 border-t border-border/50 pt-1.5">
                <span className="text-xs text-muted-foreground line-through">
                  R$ 25,00
                </span>
                <strong className="font-display text-2xl font-black text-primary">
                  R$ 15,00
                </strong>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600">
                  Economize R$ 10
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => onSelectOption(true)}
            className="cta-grad h-12 w-full rounded-2xl px-3 text-center text-xs sm:text-sm font-extrabold text-primary-foreground shadow-md shadow-primary/25 transition-transform hover:scale-[1.01] active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            Adicionar à compra por R$ 15,00
          </button>

          <button
            type="button"
            onClick={() => onSelectOption(false)}
            className="h-9 sm:h-10 w-full rounded-2xl border border-input bg-card px-3 text-center text-xs font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors cursor-pointer"
          >
            Não, quero apenas o depilador
          </button>

          <p className="mt-0.5 flex items-center justify-center gap-1 text-center text-[10px] text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0 text-primary" />
            Próximo passo: dados de entrega e Pix
          </p>
        </div>
      </div>
    </div>
  );
};
