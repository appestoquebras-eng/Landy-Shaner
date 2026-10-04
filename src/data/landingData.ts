import { CareMode, FaqItem, Testimonial } from '../types';

export const CARE_MODES: CareMode[] = [
  {
    icon: 'heart',
    title: 'Para todo o corpo',
    text: 'Axilas, virilha, pernas, rosto e buço em um só aparelho — prático para o dia a dia.'
  },
  {
    icon: 'sparkles',
    title: 'Sobrancelhas perfeitas',
    text: 'Modelagem delicada e precisa, sem pinças e sem dor.'
  },
  {
    icon: 'feather',
    title: 'Pele macia e uniforme',
    text: 'Resultado suave e duradouro, sem irritações e sem pelos encravados.'
  },
  {
    icon: 'shield',
    title: 'Nariz e orelhas sem pelos',
    text: 'Cabeça de corte seguro que protege sua pele em qualquer área do corpo.'
  }
];

export const BODY_AREAS = [
  'Axilas',
  'Áreas íntimas',
  'Rosto',
  'Sobrancelhas',
  'Buço',
  'Nariz e orelhas'
];

export const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Mariana S.',
    city: 'São Paulo, SP',
    stars: 5,
    initial: 'M',
    text: 'Chegou super rápido e a máquina é maravilhosa! Uso nas axilas e no rosto, pele lisinha e sem nenhuma irritação. Melhor compra do ano.'
  },
  {
    name: 'Camila R.',
    city: 'Belo Horizonte, MG',
    stars: 5,
    initial: 'C',
    text: 'Comprei uma pra mim e outra de presente pra minha mãe — ela amou! Atendimento nota 1000.'
  },
  {
    name: 'Patrícia L.',
    city: 'Recife, PE',
    stars: 5,
    initial: 'P',
    text: 'Uso nas pernas e axilas e virou parte da minha rotina. É muito mais prático do que ficar marcando depilação e o acabamento fica lindo.'
  },
  {
    name: 'Jéssica M.',
    city: 'Curitiba, PR',
    stars: 5,
    initial: 'J',
    text: 'Indolor de verdade, nem dói. Uso no buço toda semana sem vermelhidão. A cabeça da sobrancelha deixa ela definidinha.'
  },
  {
    name: 'Aline F.',
    city: 'Salvador, BA',
    stars: 5,
    initial: 'A',
    text: 'Vem com cabo USB, carrega rápido e a bateria dura bastante. Levo na bolsa até pra viagem. Amei, já indiquei pras amigas.'
  },
  {
    name: 'Fernanda T.',
    city: 'Fortaleza, CE',
    stars: 5,
    initial: 'F',
    text: 'Entrega antes do prazo e produto chegou perfeito, bem embalado. Já é o segundo que compro — o primeiro ganhei da cunhada e quis o meu.'
  }
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'O frete é realmente grátis?',
    a: 'Sim! Frete grátis para todo o Brasil, com código de rastreio enviado assim que o pedido é despachado.'
  },
  {
    q: 'Em quanto tempo eu recebo?',
    a: 'Enviamos em até 24h após a confirmação. O prazo médio de entrega é de 5 a 12 dias úteis, dependendo da sua região.'
  },
  {
    q: 'O aparelho é indolor mesmo?',
    a: 'Sim. As lâminas são macias e seguras, feitas para uso em axilas, áreas íntimas, rosto e virilha sem irritar a pele — sem dor e sem pelos encravados.'
  },
  {
    q: 'E se eu não gostar?',
    a: 'Você tem 30 dias de garantia incondicional. Se não amar, fale com a gente e devolvemos 100% do valor — sem perguntas.'
  }
];

export const PRODUCT_BASE_PRICE = 34.90;
export const CREAM_UPSELL_PRICE = 15.00;
export const CREAM_ORIGINAL_PRICE = 25.00;
