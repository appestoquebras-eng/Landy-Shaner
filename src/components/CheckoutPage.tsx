import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  Truck,
  Copy,
  Check,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ShoppingBag
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PRODUCT_BASE_PRICE, CREAM_UPSELL_PRICE } from '../data/landingData';
import { CheckoutFormData } from '../types';
import { saveOrder } from '../lib/supabase';

interface CheckoutPageProps {
  quantity: number;
  includeCream: boolean;
  onBack: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  quantity,
  includeCream: initialIncludeCream,
  onBack,
}) => {
  const [cream, setCream] = useState<boolean>(initialIncludeCream);
  const [formData, setFormData] = useState<CheckoutFormData>({
    name: '',
    email: '',
    phone: '',
    document: '',
    postalCode: '',
    street: '',
    houseNumber: '',
    complement: '',
    district: '',
    city: '',
    state: '',
  });

  const [cepLoading, setCepLoading] = useState<boolean>(false);
  const [cepMessage, setCepMessage] = useState<string>('');
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutFormData, string>>>({});

  // Payment states
  const [isGenerated, setIsGenerated] = useState<boolean>(false);
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [orderId, setOrderId] = useState<string>('');
  const [pixTimeLeft, setPixTimeLeft] = useState<number>(900); // 15 mins

  const totalPrice = quantity * PRODUCT_BASE_PRICE + (cream ? CREAM_UPSELL_PRICE : 0);
  const formattedTotal = totalPrice.toFixed(2).replace('.', ',');

  // Formatting helpers
  const maskPhone = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 11);
    if (raw.length <= 2) return raw;
    if (raw.length <= 7) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  };

  const maskCPF = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 11);
    return raw
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  };

  const maskCEP = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 8);
    return raw.replace(/^(\d{5})(\d)/, '$1-$2');
  };

  const handleInputChange = (field: keyof CheckoutFormData, value: string) => {
    let formatted = value;
    if (field === 'phone') formatted = maskPhone(value);
    if (field === 'document') formatted = maskCPF(value);
    if (field === 'postalCode') {
      formatted = maskCEP(value);
      const digits = value.replace(/\D/g, '');
      if (digits.length === 8) {
        lookupCep(digits);
      }
    }

    setFormData((prev) => ({ ...prev, [field]: formatted }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const lookupCep = async (cleanCep: string) => {
    setCepLoading(true);
    setCepMessage('Buscando endereço...');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepMessage('CEP não encontrado. Preencha o endereço manualmente.');
      } else {
        setFormData((prev) => ({
          ...prev,
          street: data.logradouro || prev.street,
          district: data.bairro || prev.district,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
        setCepMessage('Endereço encontrado.');
      }
    } catch {
      setCepMessage('Preencha os dados do endereço manualmente.');
    } finally {
      setCepLoading(false);
    }
  };

  const validate = () => {
    const newErrors: Partial<Record<keyof CheckoutFormData, string>> = {};
    if (!formData.name.trim() || formData.name.trim().split(' ').length < 2) {
      newErrors.name = 'Informe seu nome e sobrenome completo';
    }
    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      newErrors.phone = 'Informe um WhatsApp com DDD válido';
    }
    const cleanCpf = formData.document.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      newErrors.document = 'CPF inválido (11 dígitos)';
    }
    const cleanCep = formData.postalCode.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      newErrors.postalCode = 'CEP inválido';
    }
    if (!formData.street.trim()) newErrors.street = 'Rua obrigatória';
    if (!formData.houseNumber.trim()) newErrors.houseNumber = 'Número obrigatório';
    if (!formData.district.trim()) newErrors.district = 'Bairro obrigatório';
    if (!formData.city.trim()) newErrors.city = 'Cidade obrigatória';
    if (!formData.state.trim()) newErrors.state = 'UF obrigatório';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGeneratePix = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      window.scrollTo({ top: 120, behavior: 'smooth' });
      return;
    }

    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const newOrderId = `LS-${randomNum}`;
    setOrderId(newOrderId);
    setIsGenerated(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const currentPix = `00020126580014br.gov.bcb.pix0136landyshaner-${newOrderId}-depilador520400005303986540${totalPrice.toFixed(2)}5802BR5912LANDY SHANER6009SAO PAULO62070503***6304`;

    saveOrder({
      order_id: newOrderId,
      customer_name: formData.name,
      customer_email: formData.email,
      customer_phone: formData.phone,
      customer_cpf: formData.document,
      postal_code: formData.postalCode,
      street: formData.street,
      number: formData.houseNumber,
      complement: formData.complement,
      district: formData.district,
      city: formData.city,
      state: formData.state,
      quantity,
      include_cream: cream,
      total_price: totalPrice,
      payment_method: 'pix',
      status: 'pending',
      pix_code: currentPix,
    });
  };

  useEffect(() => {
    if (!isGenerated || isPaid) return;
    const interval = setInterval(() => {
      setPixTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isGenerated, isPaid]);

  // Simulated Pix Payload
  const pixCode = `00020126580014br.gov.bcb.pix0136landyshaner-${orderId || 'LS9921'}-depilador520400005303986540${totalPrice.toFixed(2)}5802BR5912LANDY SHANER6009SAO PAULO62070503***6304`;

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleConfirmSimulation = () => {
    setIsPaid(true);
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    saveOrder({
      order_id: orderId,
      customer_name: formData.name,
      customer_email: formData.email,
      customer_phone: formData.phone,
      customer_cpf: formData.document,
      postal_code: formData.postalCode,
      street: formData.street,
      number: formData.houseNumber,
      complement: formData.complement,
      district: formData.district,
      city: formData.city,
      state: formData.state,
      quantity,
      include_cream: cream,
      total_price: totalPrice,
      payment_method: 'pix',
      status: 'paid',
      pix_code: pixCode,
    });
  };

  const formatPixTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Top Header */}
      <header className="border-b border-border bg-card/90 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            onClick={onBack}
            type="button"
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>

          <div className="flex items-center gap-2">
            <img
              src="/images/landy-shaner-logo.png"
              alt="Logo Landy Shaner"
              className="h-10 w-10 rounded-full border border-primary/30 object-cover shadow-sm"
            />
            <span className="font-display text-base font-extrabold text-foreground sm:text-lg">
              Landy Shaner
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <ShieldCheck className="h-4 w-4" /> Compra Segura
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primary">
          Pagamento seguro · Passo final
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl text-foreground">
          {isPaid
            ? 'Pedido Confirmado com Sucesso!'
            : isGenerated
            ? 'Aguardando pagamento Pix'
            : 'Finalizar Pedido!'}
        </h1>

        <div className="mt-8 grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Left Column: Form or Pix Display */}
          <div className="min-w-0">
            {isPaid ? (
              /* Success Screen */
              <div className="rounded-3xl border border-emerald-200 bg-card p-6 sm:p-8 shadow-xl text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h2 className="mt-5 font-display text-2xl font-extrabold text-foreground sm:text-3xl">
                  Parabéns, {formData.name.split(' ')[0]}!
                </h2>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                  Seu pagamento de <strong>R$ {formattedTotal}</strong> foi aprovado instantaneamente.
                </p>

                <div className="mt-6 rounded-2xl border border-border bg-secondary/50 p-4 text-left">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">
                    Código do pedido: <strong className="text-foreground">{orderId}</strong>
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    Enviaremos o código de rastreio para o seu WhatsApp{' '}
                    <strong>{formData.phone}</strong> e por e-mail assim que despachado (em até 24h).
                  </p>
                  <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <strong>Endereço de entrega:</strong> {formData.street}, {formData.houseNumber}{' '}
                    {formData.complement && `- ${formData.complement}`}, {formData.district} —{' '}
                    {formData.city}/{formData.state} ({formData.postalCode})
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onBack}
                  className="cta-grad mt-6 rounded-2xl px-8 py-3.5 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/25 cursor-pointer"
                >
                  Voltar para a Página Inicial
                </button>
              </div>
            ) : isGenerated ? (
              /* Waiting for Pix Payment Screen */
              <div className="rounded-3xl border border-border bg-card p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div>
                    <p className="font-display text-lg font-bold text-foreground">
                      Pague R$ {formattedTotal} no seu banco
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Aprovação imediata · Pedido {orderId}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatPixTimer(pixTimeLeft)}</span>
                  </div>
                </div>

                {/* QR Code and Pix instructions */}
                <div className="mt-6 flex flex-col items-center justify-center p-4">
                  <div className="rounded-2xl border-2 border-primary/30 p-3 bg-white shadow-md">
                    {/* Visual QR Code Image using public QR API */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                        pixCode
                      )}`}
                      alt="QR Code Pix"
                      className="h-48 w-48 object-contain"
                    />
                  </div>
                  <p className="mt-3 text-xs font-medium text-muted-foreground text-center">
                    Abra o app do seu banco e escaneie o QR Code acima
                  </p>
                </div>

                {/* Pix Copia e Cola */}
                <div className="mt-4">
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Ou use o Pix Copia e Cola:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={pixCode}
                      className="w-full rounded-xl border border-input bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground select-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleCopyPix}
                      className="cta-grad flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-md cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4" /> Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Step by step */}
                <div className="mt-6 rounded-2xl bg-secondary/40 p-4">
                  <p className="text-xs font-extrabold uppercase text-foreground">
                    Passo a passo rápido:
                  </p>
                  <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
                    <li>Copie o código acima ou escaneie o QR Code no seu banco</li>
                    <li>No app do seu banco, escolha a opção <strong>Pix Copia e Cola</strong></li>
                    <li>Confirme os dados e finalize a transferência</li>
                    <li>A confirmação acontece em poucos segundos de forma automática</li>
                  </ol>
                </div>

                {/* Confirmation Simulator Button */}
                <div className="mt-6 pt-4 border-t border-border flex flex-col sm:flex-row gap-3 items-center justify-between">
                  <button
                    type="button"
                    onClick={handleConfirmSimulation}
                    className="w-full sm:w-auto cta-grad rounded-xl px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/20 cursor-pointer text-center"
                  >
                    Simular Aprovação Imediata ✓
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsGenerated(false)}
                    className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
                  >
                    Alterar dados de entrega
                  </button>
                </div>
              </div>
            ) : (
              /* Checkout Form */
              <form onSubmit={handleGeneratePix} className="space-y-6">
                {/* 1. Customer Information */}
                <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    Dados pessoais
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-foreground">
                        Nome completo *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Maria Silva"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.name ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.name && (
                        <p className="mt-1 text-xs text-destructive">{errors.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground">
                        Telefone / WhatsApp *
                      </label>
                      <input
                        type="tel"
                        placeholder="(00) 00000-0000"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.phone ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.phone && (
                        <p className="mt-1 text-xs text-destructive">{errors.phone}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground">CPF *</label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        value={formData.document}
                        onChange={(e) => handleInputChange('document', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.document ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.document && (
                        <p className="mt-1 text-xs text-destructive">{errors.document}</p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-foreground">
                        E-mail (opcional)
                      </label>
                      <input
                        type="email"
                        placeholder="seuemail@exemplo.com"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Shipping Address */}
                <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-sm">
                  <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      2
                    </span>
                    Endereço de entrega
                  </h2>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-bold text-foreground">CEP *</label>
                      <input
                        type="text"
                        placeholder="00000-000"
                        value={formData.postalCode}
                        onChange={(e) => handleInputChange('postalCode', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.postalCode ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {cepMessage && (
                        <p
                          className={`mt-1 text-xs ${
                            cepLoading
                              ? 'text-primary'
                              : cepMessage.includes('não')
                              ? 'text-destructive'
                              : 'text-emerald-600'
                          }`}
                        >
                          {cepMessage}
                        </p>
                      )}
                      {errors.postalCode && (
                        <p className="mt-1 text-xs text-destructive">{errors.postalCode}</p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-foreground">
                        Rua / Endereço *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Av. Paulista"
                        value={formData.street}
                        onChange={(e) => handleInputChange('street', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.street ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.street && (
                        <p className="mt-1 text-xs text-destructive">{errors.street}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground">Número *</label>
                      <input
                        type="text"
                        placeholder="123"
                        value={formData.houseNumber}
                        onChange={(e) => handleInputChange('houseNumber', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.houseNumber ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.houseNumber && (
                        <p className="mt-1 text-xs text-destructive">{errors.houseNumber}</p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-foreground">
                        Complemento (opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Apto 42, Bloco B"
                        value={formData.complement}
                        onChange={(e) => handleInputChange('complement', e.target.value)}
                        className="mt-1 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground">Bairro *</label>
                      <input
                        type="text"
                        placeholder="Centro"
                        value={formData.district}
                        onChange={(e) => handleInputChange('district', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.district ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.district && (
                        <p className="mt-1 text-xs text-destructive">{errors.district}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground">Cidade *</label>
                      <input
                        type="text"
                        placeholder="São Paulo"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.city ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.city && (
                        <p className="mt-1 text-xs text-destructive">{errors.city}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground">UF *</label>
                      <input
                        type="text"
                        placeholder="SP"
                        maxLength={2}
                        value={formData.state}
                        onChange={(e) => handleInputChange('state', e.target.value.toUpperCase())}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground uppercase focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.state ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.state && (
                        <p className="mt-1 text-xs text-destructive">{errors.state}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  className="cta-grad w-full rounded-2xl px-6 py-4 text-base sm:text-lg font-extrabold uppercase tracking-wide text-primary-foreground shadow-xl shadow-primary/30 transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer text-center"
                >
                  Gerar Pix — R$ {formattedTotal}
                </button>
              </form>
            )}
          </div>

          {/* Right Column: Order Summary */}
          <div className="min-w-0">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/10">
              <p className="font-display text-lg font-bold text-foreground">
                Resumo do pedido
              </p>

              {/* Items */}
              <div className="mt-4 flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src="/images/kit-card-machine-Db6Uq9A5.png"
                      alt="Aparelho"
                      className="h-10 w-10 shrink-0 object-contain"
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {quantity}x Kit Depilador 4 em 1
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        R$ 34,90 cada
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-foreground whitespace-nowrap">
                    R$ {(quantity * PRODUCT_BASE_PRICE).toFixed(2).replace('.', ',')}
                  </span>
                </div>

                {/* Clareador option */}
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      id="toggle-cream"
                      checked={cream}
                      onChange={(e) => setCream(e.target.checked)}
                      className="h-4 w-4 rounded accent-primary cursor-pointer"
                    />
                    <label
                      htmlFor="toggle-cream"
                      className="text-xs font-semibold text-foreground cursor-pointer select-none"
                    >
                      Clareador Clear Beauty (+R$ 15,00)
                    </label>
                  </div>
                  {cream && (
                    <span className="font-bold text-foreground whitespace-nowrap">
                      R$ 15,00
                    </span>
                  )}
                </div>

                <div className="flex justify-between gap-3 border-t border-border/60 pt-3">
                  <span className="text-muted-foreground">Frete para todo o Brasil</span>
                  <span className="font-extrabold text-primary">GRÁTIS</span>
                </div>
              </div>

              {/* Total */}
              <div className="mt-4 flex items-end justify-between border-t border-dashed border-border pt-4">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span className="font-display text-3xl font-extrabold text-foreground tabular-nums">
                  R$ {formattedTotal}
                </span>
              </div>
              <p className="mt-1 text-right text-xs text-muted-foreground">à vista no Pix</p>

              {/* Security badges */}
              <div className="mt-6 space-y-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <span>Garantia incondicional de 30 dias</span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary shrink-0" />
                  <span>Envio imediato com código de rastreamento</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary shrink-0" />
                  <span>Seus dados protegidos por criptografia SSL</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
