import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
      <p className="font-display font-bold text-foreground text-base">Landy Shaner</p>
      <p className="mt-2 text-xs sm:text-sm">
        Compra 100% segura · Garantia de 30 dias · Frete grátis para todo o Brasil
      </p>
      <p className="mt-1 text-xs text-muted-foreground/80">
        © 2026 Landy Shaner. Todos os direitos reservados.
      </p>
    </footer>
  );
};
