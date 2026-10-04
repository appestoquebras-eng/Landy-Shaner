import {track} from './lib/meta';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { TrustBar } from './components/TrustBar';
import { OfferSection } from './components/OfferSection';
import { FourCareModes } from './components/FourCareModes';
import { WhatsInsideSection } from './components/WhatsInsideSection';
import { ComparisonSection } from './components/ComparisonSection';
import { TestimonialsSection } from './components/TestimonialsSection';
import { GuaranteeSection } from './components/GuaranteeSection';
import { FaqSection } from './components/FaqSection';
import { FinalCtaSection } from './components/FinalCtaSection';
import { Footer } from './components/Footer';
import { StickyBottomBar } from './components/StickyBottomBar';
import { UpsellModal } from './components/UpsellModal';
import { CheckoutPage } from './components/CheckoutPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'landing' | 'checkout'>('landing');
  const [quantity, setQuantity] = useState<number>(1);
  const [includeCream, setIncludeCream] = useState<boolean>(false);
  const [isUpsellOpen, setIsUpsellOpen] = useState<boolean>(false);

  // Sync with browser back button or hash
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.hash === '#checkout') {
        setCurrentPage('checkout');
      } else {
        setCurrentPage('landing');
      }
    };

    if (window.location.hash === '#checkout') {
      setCurrentPage('checkout');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenUpsell = () => {
    track('AddToCart',{content_ids:['kit-depilador'],content_type:'product',currency:'BRL',value:quantity*34.90});
    setIsUpsellOpen(true);
  };

  const handleSelectUpsellOption = (withCream: boolean) => {
    track('InitiateCheckout',{currency:'BRL',value:quantity*34.90+(withCream?15:0),num_items:quantity+(withCream?1:0)});
    setIncludeCream(withCream);
    setIsUpsellOpen(false);
    setCurrentPage('checkout');
    window.location.hash = '#checkout';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToLanding = () => {
    setCurrentPage('landing');
    window.location.hash = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToOffer = () => {
    const el = document.getElementById('oferta');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      handleOpenUpsell();
    }
  };

  if (currentPage === 'checkout') {
    return (
      <CheckoutPage
        quantity={quantity}
        includeCream={includeCream}
        onBack={handleBackToLanding}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans">
      <Navbar onBuyClick={scrollToOffer} />
      
      <main>
        <HeroSection onCtaClick={scrollToOffer} />
        <TrustBar />
        <OfferSection
          quantity={quantity}
          onQuantityChange={setQuantity}
          onProceedToCheckout={handleOpenUpsell}
        />
        <FourCareModes />
        <WhatsInsideSection />
        <ComparisonSection />
        <TestimonialsSection />
        <GuaranteeSection />
        <FaqSection />
        <FinalCtaSection onCtaClick={scrollToOffer} />
      </main>

      <Footer />

      <StickyBottomBar
        quantity={quantity}
        onBuyClick={handleOpenUpsell}
      />

      <UpsellModal
        isOpen={isUpsellOpen}
        quantity={quantity}
        onClose={() => setIsUpsellOpen(false)}
        onSelectOption={handleSelectUpsellOption}
      />
    </div>
  );
}
