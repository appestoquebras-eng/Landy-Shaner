import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQ_ITEMS } from '../data/landingData';

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <h2 className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
        Perguntas <span className="text-primary">frequentes</span>
      </h2>

      <div className="mt-10 flex flex-col gap-3">
        {FAQ_ITEMS.map((item, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className="overflow-hidden rounded-2xl border border-border bg-card transition-all"
            >
              <button
                type="button"
                onClick={() => toggle(idx)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-bold text-foreground cursor-pointer hover:bg-secondary/40 transition-colors"
                aria-expanded={isOpen}
              >
                <span className="text-base sm:text-lg">{item.q}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-primary transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground animate-fadeIn">
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
