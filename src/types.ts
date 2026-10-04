export interface Testimonial {
  name: string;
  city: string;
  stars: number;
  text: string;
  initial: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface CareMode {
  title: string;
  text: string;
  icon: 'heart' | 'sparkles' | 'feather' | 'shield';
}

export interface CheckoutFormData {
  name: string;
  email: string;
  phone: string;
  document: string; // CPF
  postalCode: string; // CEP
  street: string;
  houseNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}
