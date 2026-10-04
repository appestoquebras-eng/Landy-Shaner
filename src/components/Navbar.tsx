import React from 'react';

interface NavbarProps {
  onBuyClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onBuyClick }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-card/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <a href="#" className="flex items-center gap-3 group">
          <img
            src="/images/landy-shaner-logo.png"
            alt="Logo Landy Shaner"
            className="h-11 w-11 shrink-0 rounded-full border-2 border-primary/30 object-cover shadow-sm transition-transform group-hover:scale-105"
            onError={(e) => {
              // fallback if image fails
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="flex flex-col">
            <span className="font-display text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
              Landy Shaner
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Beleza & Cuidado Pessoal
            </span>
          </div>
        </a>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onBuyClick}
            type="button"
            className="cta-grad whitespace-nowrap shrink-0 rounded-full px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-95 cursor-pointer"
          >
            Comprar agora
          </button>
        </div>
      </div>
    </header>
  );
};
