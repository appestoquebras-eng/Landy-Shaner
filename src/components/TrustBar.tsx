import React from 'react';
import { Truck, Lock, Shield, Sparkles } from 'lucide-react';

export const TrustBar: React.FC = () => {
  return (
    <section className="border-y border-border/70 bg-card/60">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 sm:grid-cols-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            <Truck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Frete grátis</p>
            <p className="text-xs text-muted-foreground">para todo o Brasil</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Compra segura</p>
            <p className="text-xs text-muted-foreground">dados 100% protegidos</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Garantia</p>
            <p className="text-xs text-muted-foreground">30 dias incondicional</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Envio em 24h</p>
            <p className="text-xs text-muted-foreground">com código de rastreio</p>
          </div>
        </div>
      </div>
    </section>
  );
};
