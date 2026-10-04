import React, { useState, useEffect } from 'react';

interface FinalCtaSectionProps {
  onCtaClick: () => void;
}

export const FinalCtaSection: React.FC<FinalCtaSectionProps> = ({ onCtaClick }) => {
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
        if (prev <= 1) return 893;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <section className="cta-grad px-4 py-16 text-center text-primary-foreground">
      <div className="mx-auto max-w-2xl">
        <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
          Pronta para se sentir ainda mais incrível?
        </h2>
        <p className="mt-3 text-base sm:text-lg text-primary-foreground/90">
          Kit 4 em 1 por R$ 34,90 cada — leve quantas quiser. Frete grátis e garantia de 30 dias.
        </p>

        <button
          onClick={onCtaClick}
          type="button"
          className="mt-7 rounded-2xl bg-card px-10 py-4 text-base sm:text-lg font-extrabold uppercase tracking-wide text-foreground shadow-2xl transition-transform hover:scale-[1.03] active:scale-95 cursor-pointer"
        >
          Quero o meu agora →
        </button>

        <p className="mt-4 text-sm text-primary-foreground/80">
          ⏳ A oferta termina em{' '}
          <span className="font-extrabold tabular-nums bg-white/20 px-2 py-0.5 rounded text-white">
            {formatTimer(secondsLeft)}
          </span>
        </p>
      </div>
    </section>
  );
};
