export const CUSTOMER_REVIEWS = [
  ['Mariana S.', 'Chegou certinho e bem rápido. Gostei bastante da compra e veio tudo conforme eu esperava.'],
  ['Gabriela M.', 'Recebi antes do prazo e veio tudo certinho. Gostei muito, recomendo.'],
  ['Fernanda A.', 'Produto chegou bem embalado e sem nenhum problema. Compra tranquila e entrega rápida.'],
  ['Juliana R.', 'Gostei bastante. Chegou rápido, tudo certinho e bem embalado.'],
  ['Amanda C.', 'Minha compra chegou direitinho e dentro do prazo. Recomendo, gostei bastante.'],
  ['Camila P.', 'Chegou tudo certinho aqui. Foi bem rápido e fiquei satisfeita com a compra.'],
  ['Beatriz L.', 'Recebi certinho e gostei bastante. Entrega rápida e veio tudo bem embalado.'],
  ['Larissa F.', 'Deu tudo certo com meu pedido. Chegou rápido e exatamente como eu esperava.'],
  ['Letícia G.', 'Gostei muito da compra. Chegou certinho, bem embalado e sem demora.'],
  ['Bruna T.', 'Pedido recebido certinho. Achei a entrega bem rápida e gostei bastante.'],
  ['Natália D.', 'Chegou tudo direitinho e em ótimo estado. Recomendo, tive uma boa experiência.'],
  ['Carolina V.', 'Recebi meu pedido bem rápido. Veio tudo certinho e fiquei muito satisfeita.'],
  ['Bianca N.', 'Gostei bastante. A entrega foi rápida e o pedido chegou sem nenhum problema.'],
  ['Vanessa B.', 'Tudo certo com a compra. Chegou rápido e veio bem embalado. Recomendo.'],
  ['Daniela H.', 'Meu pedido chegou certinho e antes do que eu esperava. Gostei bastante.'],
  ['Priscila E.', 'Chegou direitinho, bem embalado e rápido. Compra aprovada.'],
  ['Renata J.', 'Recebi tudo certinho. Gostei muito e com certeza compraria novamente.'],
  ['Isabela O.', 'Entrega rápida e pedido certinho. Fiquei satisfeita e recomendo.'],
] as const;

// Photos form an independent gallery; their owners have not been identified.
export const CUSTOMER_PHOTOS = Array.from({length: 18}, (_, i) => `/images/reviews/photo-${String(i + 1).padStart(2, '0')}.${[2,3,5,6,7,8,9].includes(i + 1) ? 'webp' : i === 14 ? 'png' : 'jpg'}`);
