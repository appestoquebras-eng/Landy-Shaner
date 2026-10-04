import React, { useState, useEffect, useRef } from 'react';
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
  ShoppingBag,
  Loader2,
  CheckCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import { PRODUCT_BASE_PRICE, CREAM_UPSELL_PRICE } from '../data/landingData';
import { CheckoutFormData } from '../types';
import { createCheckoutCharge, checkOrderStatus } from '../lib/api';

interface CheckoutPageProps {
  quantity: number;
  includeCream: boolean;
  onBack: () => void;
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
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
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfigMissing, setIsConfigMissing] = useState<boolean>(false);

  const [isGenerated, setIsGenerated] = useState<boolean>(false);
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [orderId, setOrderId] = useState<string>('');
  const [guestToken, setGuestToken] = useState<string>('');
  const [pixCode, setPixCode] = useState<string>('');
  const [pixImage, setPixImage] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [pixTimeLeft, setPixTimeLeft] = useState<number>(900); // 15 mins

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

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
    if (!formData.email.trim() || !EMAIL_REGEX.test(formData.email.trim())) {
      newErrors.email = 'Informe um e-mail válido obrigatório';
    }
    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      newErrors.phone = 'Informe um WhatsApp com DDD válido (10 ou 11 dígitos)';
    }
    if (!isValidCPF(formData.document)) {
      newErrors.document = 'CPF inválido (dígitos verificadores incorretos)';
    }
    const cleanCep = formData.postalCode.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      newErrors.postalCode = 'CEP inválido (8 dígitos)';
    }
    if (!formData.street.trim()) newErrors.street = 'Rua obrigatória';
    if (!formData.houseNumber.trim()) newErrors.houseNumber = 'Número obrigatório';
    if (!formData.district.trim()) newErrors.district = 'Bairro obrigatório';
    if (!formData.city.trim()) newErrors.city = 'Cidade obrigatória';
    if (!formData.state.trim()) newErrors.state = 'UF obrigatório';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGeneratePix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validate()) {
      window.scrollTo({ top: 120, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setIsConfigMissing(false);

    try {
      const response = await createCheckoutCharge(formData, quantity, cream);

      if (!response.success) {
        if (response.error?.errorCode === 'GATEWAY_NOT_CONFIGURED') {
          setIsConfigMissing(true);
          setErrorMessage(response.error.message);
        } else {
          setErrorMessage(
            response.error?.message || 'Não foi possível gerar a cobrança Pix. Tente novamente.'
          );
        }
        setIsSubmitting(false);
        return;
      }

      if (response.status === 'paid') {
        setIsPaid(true);
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
        });
        return;
      }

      if (response.status === 'uncertain') {
        setErrorMessage('Sua cobrança está sendo confirmada com o gateway. Aguarde alguns instantes sem recriar o pedido.');
        setIsSubmitting(false);
        return;
      }

      if (response.orderId && response.guestToken && response.pixCode) {
        setOrderId(response.orderId);
        setGuestToken(response.guestToken);
        setPixCode(response.pixCode);
        if (response.pixImage) {
          setPixImage(response.pixImage);
        }

        if (response.expiresAt) {
          const expMs = new Date(response.expiresAt).getTime();
          const diffSec = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
          if (diffSec > 0) {
            setPixTimeLeft(diffSec);
          }
        }

        // Gerar QR code local em alta definição a partir do código Pix real
        try {
          const url = await QRCode.toDataURL(response.pixCode, {
            width: 256,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          setQrCodeUrl(url);
        } catch (err) {
          console.error('Erro ao renderizar QRCode:', err);
        }

        setIsGenerated(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha de conexão com o servidor ao gerar o Pix.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Timer decrescente do Pix (apenas informativo)
  useEffect(() => {
    if (!isGenerated || isPaid) return;
    const interval = setInterval(() => {
      setPixTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isGenerated, isPaid]);

  // Acompanhamento automático de status do pedido via backend (polling a cada 4s)
  useEffect(() => {
    if (!isGenerated || isPaid || !orderId || !guestToken) return;

    const poll = async () => {
      try {
        const res = await checkOrderStatus(orderId, guestToken);
        if (res.success && res.status === 'paid') {
          setIsPaid(true);
          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
          });
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (err) {
        // Falha transitória de consulta; tentará no próximo ciclo
      }
    };

    pollingRef.current = setInterval(poll, 4000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isGenerated, isPaid, orderId, guestToken]);

  const handleCopyPix = () => {
    if (!pixCode) return;
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
            ? 'Aguardando confirmação do Pix'
            : 'Finalizar Pedido'}
        </h1>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm leading-relaxed">
              <strong>{isConfigMissing ? 'Atenção na Configuração:' : 'Erro no processamento:'}</strong>{' '}
              {errorMessage}
            </div>
          </div>
        )}

        <div className="mt-8 grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Left Column: Form or Pix Display */}
          <div className="min-w-0">
            {isPaid ? (
              /* Success Screen (Confirmed ONLY by server state) */
              <div className="rounded-3xl border border-emerald-200 bg-card p-6 sm:p-8 shadow-xl text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h2 className="mt-5 font-display text-2xl font-extrabold text-foreground sm:text-3xl">
                  Pagamento Confirmado!
                </h2>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                  Recebemos a confirmação do seu pagamento de <strong>R$ {formattedTotal}</strong> com sucesso.
                </p>

                <div className="mt-6 rounded-2xl border border-border bg-secondary/50 p-4 text-left space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">
                    Código do pedido: <strong className="text-foreground">{orderId}</strong>
                  </p>
                  <p className="text-sm text-foreground">
                    Enviaremos o código de rastreamento para o seu WhatsApp{' '}
                    <strong>{formData.phone}</strong> assim que o kit for postado nos Correios (preparação de envio em andamento).
                  </p>
                  <div className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    <strong>Endereço de entrega:</strong> {formData.street}, {formData.houseNumber}{' '}
                    {formData.complement && `- ${formData.complement}`}, {formData.district} —{' '}
                    {formData.city}/{formData.state} ({formData.postalCode})
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center justify-center gap-2">
                  <Truck className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Seu pedido já foi enviado para a esteira de separação e expedição prioritária.</span>
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
              <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div>
                    <p className="font-display text-lg font-bold text-foreground">
                      Pague R$ {formattedTotal} via Pix
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pedido {orderId} · Sigilo Pay
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatPixTimer(pixTimeLeft)}</span>
                  </div>
                </div>

                {/* Status indicator: polling backend */}
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary/5 p-3 text-xs font-semibold text-primary border border-primary/20">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                  </span>
                  <span>Aguardando confirmação do banco... (reconhecimento automático)</span>
                </div>

                {/* QR Code */}
                <div className="mt-5 flex flex-col items-center justify-center p-3">
                  <div className="rounded-2xl border-2 border-primary/30 p-3 bg-white shadow-md">
                    {pixImage ? (
                      <img
                        src={pixImage}
                        alt="QR Code Pix"
                        className="h-48 w-48 object-contain"
                      />
                    ) : qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="QR Code Pix"
                        className="h-48 w-48 object-contain"
                      />
                    ) : (
                      <div className="h-48 w-48 flex items-center justify-center bg-secondary/30 rounded-xl">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs font-medium text-muted-foreground text-center">
                    Abra o app do seu banco e aponte a câmera para o QR Code acima
                  </p>
                </div>

                {/* Pix Copia e Cola */}
                <div className="mt-4">
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Ou copie o código Pix abaixo:
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
                    Como pagar:
                  </p>
                  <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
                    <li>Copie o código acima ou escaneie o QR Code no seu banco</li>
                    <li>No app do seu banco, escolha <strong>Pix Copia e Cola</strong></li>
                    <li>Confirme o valor de <strong>R$ {formattedTotal}</strong> e finalize</li>
                    <li>Esta tela atualizará automaticamente assim que o pagamento for registrado</li>
                  </ol>
                </div>

                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setIsGenerated(false);
                      setErrorMessage(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
                  >
                    ← Alterar dados de entrega
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
                        E-mail *
                      </label>
                      <input
                        type="email"
                        placeholder="seuemail@exemplo.com"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className={`mt-1 w-full rounded-xl border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                          errors.email ? 'border-destructive ring-1 ring-destructive' : 'border-input'
                        }`}
                      />
                      {errors.email && (
                        <p className="mt-1 text-xs text-destructive">{errors.email}</p>
                      )}
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

                {/* Submit button with double-click protection */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`cta-grad w-full rounded-2xl px-6 py-4 text-base sm:text-lg font-extrabold uppercase tracking-wide text-primary-foreground shadow-xl shadow-primary/30 transition-transform ${
                    isSubmitting ? 'opacity-80 cursor-wait' : 'hover:scale-[1.02] active:scale-95 cursor-pointer'
                  } text-center flex items-center justify-center gap-2`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Gerando Pix Seguro...</span>
                    </>
                  ) : (
                    <span>Gerar Pix — R$ {formattedTotal}</span>
                  )}
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
