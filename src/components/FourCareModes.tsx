import React from 'react';
import { Heart, Sparkles, Feather, ShieldCheck } from 'lucide-react';
import { CARE_MODES } from '../data/landingData';

export const FourCareModes: React.FC = () => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'heart':
        return <Heart className="h-6 w-6" />;
      case 'sparkles':
        return <Sparkles className="h-6 w-6" />;
      case 'feather':
        return <Feather className="h-6 w-6" />;
      case 'shield':
      default:
        return <ShieldCheck className="h-6 w-6" />;
    }
  };

  return (
    <section className="bg-background py-14 sm:py-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
          Um só aparelho, <span className="text-primary">quatro cuidados</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground sm:text-base">
          Troque quatro aparelhos por um só — e leve a beleza do salão para a sua casa.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CARE_MODES.map((item, index) => (
            <div
              key={index}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                {getIcon(item.icon)}
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
