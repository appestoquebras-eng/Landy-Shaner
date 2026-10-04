import React from 'react';
import { PRODUCT_BASE_PRICE } from '../data/landingData';

interface StickyBottomBarProps {
  quantity: number;
  onBuyClick: () => void;
}

export const StickyBottomBar: React.FC<StickyBottomBarProps> = ({ quantity, onBuyClick }) => {
  const totalPrice = (quantity * PRODUCT_BASE_PRICE).toFixed(2).replace('.', ',');

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-2 sm:px-4">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Seu pedido · frete grátis
            </p>
            <p className="font-display text-xl font-extrabold text-primary tabular-nums">
              R$ {totalPrice}
            </p>
          </div>

          <button
            onClick={onBuyClick}
            type="button"
            className="cta-grad rounded-2xl px-6 py-3 text-xs sm:text-sm font-extrabold uppercase tracking-wide text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            Comprar agora →
          </button>
        </div>
      </div>
      {/* Spacer so sticky bar doesn't overlap footer content */}
      <div className="h-20" />
    </>
  );
};
