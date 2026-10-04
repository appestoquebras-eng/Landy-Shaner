import React from 'react';

export const ComparisonSection: React.FC = () => {
  return (
    <section className="bg-background py-14 sm:py-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <span className="inline-flex rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
            Chega de sofrer para se depilar
          </span>

          <h2 className="mt-4 font-display text-3xl font-extrabold text-foreground sm:text-4xl">
            Mais conforto para cuidar de você <span className="text-primary">todos os dias</span>
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Evite cortes, dor e o gasto constante com lâminas. Tenha um acabamento suave com um aparelho reutilizável, compacto e pronto para a sua rotina.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:shadow-md">
            <img
              src="/images/kit-comparativo.webp"
              alt="Comparação com cera e lâmina"
              className="h-auto w-full object-contain sm:aspect-square sm:object-cover transition-transform hover:scale-105"
            />
            <div className="p-4">
              <p className="text-xs font-bold text-foreground">Economia real</p>
              <p className="text-[11px] text-muted-foreground">Sem comprar lâminas descartáveis</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:shadow-md">
            <img
              src="/images/kit-pele-macia.webp"
              alt="Pele macia com mais praticidade"
              className="h-auto w-full object-contain sm:aspect-square sm:object-cover transition-transform hover:scale-105"
            />
            <div className="p-4">
              <p className="text-xs font-bold text-foreground">Toque suave</p>
              <p className="text-[11px] text-muted-foreground">Pele macia sem pelos encravados</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:shadow-md">
            <img
              src="/images/kit-rotina.webp"
              alt="Kit na rotina de autocuidado"
              className="h-auto w-full object-contain sm:aspect-square sm:object-cover transition-transform hover:scale-105"
            />
            <div className="p-4">
              <p className="text-xs font-bold text-foreground">Fácil no dia a dia</p>
              <p className="text-[11px] text-muted-foreground">Depilação rápida em minutos</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:shadow-md">
            <img
              src="/images/kit-acessorios-reais.jpg"
              alt="Foto real do aparelho e acessórios"
              className="h-auto w-full object-contain sm:aspect-square sm:object-cover transition-transform hover:scale-105"
            />
            <div className="p-4">
              <p className="text-xs font-bold text-foreground">Kit completo</p>
              <p className="text-[11px] text-muted-foreground">Cabo USB, escovinha e cabeças</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
