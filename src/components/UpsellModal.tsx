import React from 'react';
import { X, Lock } from 'lucide-react';
import { PRODUCT_BASE_PRICE, CREAM_UPSELL_PRICE } from '../data/landingData';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Click outside to close */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-extrabold text-foreground sm:text-xl">
            Deseja adicionar o Clareador?
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Order Summary */}
        <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
          Seu pedido: <strong className="text-foreground">{quantity}x Kit Depilador 4 em 1</strong> · R$ {orderTotalFormatted} · Frete grátis
        </p>

        {/* Exclusive Offer Box */}
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-primary bg-card shadow-md">
          <div className="cta-grad px-3 py-1.5 text-center text-xs font-extrabold uppercase tracking-wide text-primary-foreground">
            Oferta exclusiva deste pedido
          </div>

          <div className="p-4 sm:grid sm:grid-cols-[140px_1fr] sm:items-center sm:gap-4">
            <div className="overflow-hidden rounded-xl bg-secondary/50 flex items-center justify-center">
              <img
                src="/images/clareador-promo.jpg"
                alt="Creme Clareador Íntimo e Corporal Clear Beauty"
                className="h-36 w-full object-cover sm:h-32 rounded-xl"
              />
            </div>

            <div className="mt-3 sm:mt-0">
              <p className="font-display text-base font-extrabold text-foreground sm:text-lg">
                Clareador Clear Beauty
              </p>
              <p className="mt-1 text-xs sm:text-sm leading-snug text-muted-foreground">
                Para axilas, virilha, joelhos e cotovelos. Remove manchas escuras e uniformiza o tom da pele.
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xs sm:text-sm text-muted-foreground line-through">
                  R$ 25,00
                </span>
                <strong className="font-display text-2xl font-extrabold text-primary">
                  R$ 15,00
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 grid gap-2.5">
          <button
            type="button"
            onClick={() => onSelectOption(true)}
            className="cta-grad h-auto min-h-14 w-full rounded-2xl px-4 py-3 text-center text-sm sm:text-base font-extrabold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-[1.01] active:scale-98 cursor-pointer"
          >
            Sim, quero adicionar por R$ 15,00
          </button>

          <button
            type="button"
            onClick={() => onSelectOption(false)}
            className="h-auto min-h-12 w-full rounded-2xl border border-input bg-card px-4 py-2.5 text-center text-xs sm:text-sm font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors cursor-pointer"
          >
            Não, obrigado! Só o depilador
          </button>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
          Próximo passo: dados de entrega e Pix
        </p>
      </div>
    </div>
  );
};
