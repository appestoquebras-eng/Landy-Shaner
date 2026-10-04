import React, { useState, useEffect } from 'react';
import { Lock, Shield, Truck } from 'lucide-react';
import { PRODUCT_BASE_PRICE } from '../data/landingData';

interface OfferSectionProps {
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onProceedToCheckout: () => void;
}

export const OfferSection: React.FC<OfferSectionProps> = ({
  quantity,
  onQuantityChange,
  onProceedToCheckout,
}) => {
  // Countdown timer starting at 14:53 (893 seconds)
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const saved = sessionStorage.getItem('promo_timer_seconds');
    if (saved) {
      const parsed = parseInt(saved, 10);
      return !isNaN(parsed) && parsed > 0 ? parsed : 893;
    }
    return 893;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          return 893; // reset loop or stay at 0
        }
        const next = prev - 1;
        sessionStorage.setItem('promo_timer_seconds', next.toString());
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalPrice = (quantity * PRODUCT_BASE_PRICE).toFixed(2).replace('.', ',');

  return (
    <section id="oferta" className="scroll-mt-16 bg-background py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-md shadow-primary/20">
            🔥 Oferta especial — só nesta página
          </span>

          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Escolha a quantidade do seu <span className="text-primary">kit</span>
          </h2>

          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            A oferta de lançamento termina em{' '}
            <span className="font-extrabold tabular-nums text-foreground bg-primary/10 px-2 py-0.5 rounded-md text-primary">
              {formatTimer(secondsLeft)}
            </span>{' '}
            — depois disso, os preços voltam ao normal.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1fr_380px]">
          {/* Left Column: Product Box and Selector */}
          <div className="flex min-w-0 flex-col gap-5">
            <div className="rounded-3xl border-2 border-primary bg-card p-5 shadow-xl shadow-primary/15 sm:p-6 transition-all">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <img
                    src="/images/kit-card-machine-Db6Uq9A5.png"
                    alt="Máquina 4 em 1 de depilação"
                    width={64}
                    height={102}
                    className="h-16 w-auto shrink-0 object-contain drop-shadow-sm sm:h-20"
                  />
                  <div className="min-w-0">
                    <p className="font-display text-base font-bold text-foreground sm:text-lg">
                      Kit Depilador Elétrico 4 em 1
                    </p>
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      R$ 34,90 cada — leve quantas quiser
                    </p>
                  </div>
                </div>
                <p className="shrink-0 whitespace-nowrap text-right font-display text-2xl font-extrabold text-primary">
                  R$ 34,90
                </p>
              </div>

              {/* Quantity Selector */}
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-border bg-secondary/60 p-2 sm:p-3">
                <button
                  type="button"
                  onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  aria-label="Remover uma máquina"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-2xl font-extrabold text-foreground transition-transform hover:border-primary hover:text-primary active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  −
                </button>

                <div className="text-center">
                  <p className="font-display text-3xl font-extrabold leading-none text-foreground sm:text-4xl tabular-nums">
                    {quantity}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    {quantity === 1 ? 'máquina no pedido' : 'máquinas no pedido'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onQuantityChange(quantity + 1)}
                  aria-label="Adicionar uma máquina"
                  className="cta-grad flex h-12 w-12 items-center justify-center rounded-full text-2xl font-extrabold text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-90 cursor-pointer"
                >
                  +
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-medium text-emerald-600">
                  ✓ Estoque disponível para envio imediato
                </span>
                <span className="font-semibold text-primary">
                  {quantity > 1 ? `Economia multiplicada por ${quantity} unidades` : 'Garantia de 30 dias incluída'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary Card */}
          <div className="min-w-0 lg:sticky lg:top-24">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/10">
              <p className="font-display text-lg font-bold text-foreground">Seu pedido</p>

              <div className="mt-4 flex flex-col gap-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-foreground">
                    {quantity}x Kit Depilador 4 em 1
                  </span>
                  <span className="font-bold text-foreground tabular-nums">
                    R$ {totalPrice}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="font-extrabold text-primary">GRÁTIS</span>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between border-t border-dashed border-border pt-4">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span className="font-display text-3xl sm:text-4xl font-extrabold text-foreground tabular-nums">
                  R$ {totalPrice}
                </span>
              </div>
              <p className="mt-1 text-right text-xs text-muted-foreground">à vista no Pix</p>

              <button
                onClick={onProceedToCheckout}
                type="button"
                className="cta-grad mt-5 w-full rounded-2xl px-6 py-4 text-base sm:text-lg font-extrabold uppercase tracking-wide text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer text-center"
              >
                Comprar agora →
              </button>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-muted-foreground">
                <span className="flex flex-col items-center gap-1">
                  <Lock className="h-4 w-4 text-primary" /> Compra segura
                </span>
                <span className="flex flex-col items-center gap-1">
                  <Shield className="h-4 w-4 text-primary" /> 30 dias garantia
                </span>
                <span className="flex flex-col items-center gap-1">
                  <Truck className="h-4 w-4 text-primary" /> Frete grátis
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
