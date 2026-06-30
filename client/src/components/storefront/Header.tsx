import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "@/context/CartContext";
import { useCustomer } from "@/context/CustomerContext";
import { useHub } from "@/context/HubContext";
import { Button } from "@/components/ui/button";
import { MicOff } from "lucide-react";
import { CategoryMenuDropdown } from "@/components/storefront/CategoryMenu";
import { OtpModal } from "@/components/storefront/OtpModal";
import { LocationPicker } from "@/components/storefront/LocationPicker";

import { FishTokriLogo } from "@/components/storefront/FishTokriLogo";
import cartImg from "@assets/shopping-bag_1774706595493.png";
import userImg from "@assets/user_(1)_1774707188827.png";
import searchImg from "@assets/search-interface-symbol_1774706690468.png";
import locationImg from "@assets/placeholder_(1)_1774706943633.png";
import menuIconImg from "@assets/category_1774778224285.png";
import micImg from "@assets/mic_1778182669857.png";

const SEARCH_PHRASES = [
  "Search for fresh seafood...",
  "Try Surmai or Pomfret...",
  "Chicken, Mutton, Prawns...",
  "Fresh Crab & Lobster...",
  "Search for Masalas...",
  "Bombil, Bangda, Rawas...",
];

function TypewriterPlaceholder() {
  const [displayed, setDisplayed] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      const t = setTimeout(() => setPaused(false), 1400);
      return () => clearTimeout(t);
    }

    const phrase = SEARCH_PHRASES[phraseIdx];

    if (!deleting) {
      if (charIdx < phrase.length) {
        const t = setTimeout(() => {
          setDisplayed(phrase.slice(0, charIdx + 1));
          setCharIdx(c => c + 1);
        }, 55);
        return () => clearTimeout(t);
      } else {
        setPaused(true);
        setDeleting(true);
      }
    } else {
      if (charIdx > 0) {
        const t = setTimeout(() => {
          setDisplayed(phrase.slice(0, charIdx - 1));
          setCharIdx(c => c - 1);
        }, 30);
        return () => clearTimeout(t);
      } else {
        setDeleting(false);
        setPhraseIdx(i => (i + 1) % SEARCH_PHRASES.length);
      }
    }
  }, [charIdx, deleting, paused, phraseIdx]);

  return (
    <span className="text-muted-foreground/60 text-sm pointer-events-none select-none">
      {displayed}
      <span className="animate-pulse">|</span>
    </span>
  );
}

export function Header({
  onSearch,
  onSearchSubmit,
  collapsibleMobileSearch,
  onLogoClick,
}: {
  onSearch?: (query: string) => void;
  onSearchSubmit?: (query: string) => void;
  collapsibleMobileSearch?: boolean;
  onLogoClick?: () => void;
}) {
  const { totalItems, setIsCartOpen } = useCart();
  const { customer } = useCustomer();
  const { selectedSubHub, selectedSuperHub, openPicker } = useHub();
  const [, navigate] = useLocation();
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const recognitionRef = useRef<any>(null);
  const showSearchUI = !!(onSearch || onSearchSubmit);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit?.(searchValue.trim());
  };
  const handleChange = (val: string) => {
    setSearchValue(val);
    onSearch?.(val);
  };

  const startVoiceSearch = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice search is not supported in your browser. Please try Chrome or Edge.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchValue(transcript);
      onSearch?.(transcript);
    };
    recognition.start();
  }, [isListening, onSearch]);

  const locationLabel = selectedSubHub
    ? selectedSubHub.name
    : selectedSuperHub
    ? selectedSuperHub.name
    : "Select Area";

  const handleProfileClick = () => {
    if (customer) {
      navigate("/profile");
    } else {
      setOtpModalOpen(true);
    }
  };

  return (
    <>
    <header className="sticky top-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Left: Logo */}
        <div className="flex items-center shrink-0">
          {onLogoClick ? (
            <button onClick={onLogoClick} className="flex items-center group focus:outline-none">
              <FishTokriLogo className="h-8 sm:h-11 w-auto" />
            </button>
          ) : (
            <Link href="/" className="flex items-center group">
              <FishTokriLogo className="h-8 sm:h-11 w-auto" />
            </Link>
          )}
        </div>

        {/* Center: Search bar — desktop only */}
        {showSearchUI && (
          <form onSubmit={handleSubmit} className="flex-1 max-w-md relative hidden sm:block">
            <img src={searchImg} alt="Search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 object-contain z-10" />
            {/* Typewriter placeholder shown when empty & unfocused */}
            {!searchValue && !searchFocused && (
              <div className="absolute left-10 top-1/2 -translate-y-1/2 z-10">
                <TypewriterPlaceholder />
              </div>
            )}
            <input
              type="search"
              value={searchValue}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full pl-10 pr-10 h-10 rounded-full bg-white border border-slate-200 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 text-sm transition-all"
              data-testid="input-search-desktop"
            />
            <button
              type="button"
              onClick={startVoiceSearch}
              className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 p-0.5 rounded-full transition-colors ${isListening ? "animate-pulse" : "hover:opacity-70"}`}
              aria-label={isListening ? "Stop voice search" : "Start voice search"}
              data-testid="button-voice-search-desktop"
            >
              {isListening
                ? <MicOff className="w-4 h-4 text-red-500" />
                : <img src={micImg} alt="Voice search" className="w-4 h-4 object-contain" style={{ filter: "brightness(0)" }} />
              }
            </button>
          </form>
        )}

        {/* Right: Icons */}
        <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">
          {/* Mobile-only search icon — toggles the search bar below */}
          {showSearchUI && collapsibleMobileSearch && (
            <Button
              variant="ghost"
              size="icon"
              className={`sm:hidden text-foreground hover:bg-accent/10 rounded-full w-9 h-9 transition-colors ${mobileSearchOpen ? "bg-accent/10" : ""}`}
              onClick={() => setMobileSearchOpen(v => !v)}
              aria-label={mobileSearchOpen ? "Close search" : "Open search"}
              data-testid="button-toggle-mobile-search"
            >
              <img src={searchImg} alt="Search" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
            </Button>
          )}

          {/* Category menu icon */}
          <Button
            variant="ghost"
            size="icon"
            className={`text-foreground hover:bg-accent/10 rounded-full w-9 h-9 transition-colors ${categoryMenuOpen ? "bg-accent/10" : ""}`}
            onClick={() => setCategoryMenuOpen(v => !v)}
            aria-label="Categories"
            data-testid="button-categories"
          >
            <img src={menuIconImg} alt="Categories" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="text-foreground hover:bg-accent/10 rounded-full w-9 h-9 relative"
            onClick={handleProfileClick}
            aria-label={customer ? "My Profile" : "Login"}
            data-testid="button-profile"
          >
            <img src={userImg} alt="Profile" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
          </Button>

          <Button
            onClick={() => setIsCartOpen(true)}
            variant="ghost"
            size="icon"
            className="relative text-foreground hover:bg-accent/10 rounded-full w-9 h-9"
            data-testid="button-cart"
          >
            <img src={cartImg} alt="Cart" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 bg-[#F05B4E] text-white text-[10px] font-bold flex items-center justify-center rounded-full shadow-md animate-in zoom-in">
                {totalItems}
              </span>
            )}
          </Button>

          {/* Location */}
          <button
            onClick={openPicker}
            className="flex items-center pl-2 border-l border-slate-400 ml-0.5 hover:opacity-70 transition-opacity"
            data-testid="button-location-picker"
            aria-label="Check delivery area"
          >
            <img src={locationImg} alt="Location" className="w-5 h-5 sm:w-5 sm:h-5 object-contain flex-shrink-0" />
          </button>
        </div>
      </div>

      {/* Category mega-menu dropdown */}
      <CategoryMenuDropdown
        open={categoryMenuOpen}
        onClose={() => setCategoryMenuOpen(false)}
      />

      {/* Mobile pill search — below header. In collapsible mode, only visible when toggled. */}
      {showSearchUI && (!collapsibleMobileSearch || mobileSearchOpen) && (
        <div className="sm:hidden px-3 pb-2.5 pt-1 bg-white/95 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="relative">
            <img src={searchImg} alt="Search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 object-contain z-10" />
            {!searchValue && !searchFocused && (
              <div className="absolute left-10 top-1/2 -translate-y-1/2 z-10">
                <TypewriterPlaceholder />
              </div>
            )}
            <input
              type="search"
              autoFocus={collapsibleMobileSearch && mobileSearchOpen}
              value={searchValue}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full pl-10 pr-10 h-10 rounded-full bg-white border border-slate-200 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 text-sm transition-all"
              data-testid="input-search-mobile"
            />
            <button
              type="button"
              onClick={startVoiceSearch}
              className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 p-0.5 rounded-full transition-colors ${isListening ? "animate-pulse" : "hover:opacity-70"}`}
              aria-label={isListening ? "Stop voice search" : "Start voice search"}
              data-testid="button-voice-search-mobile"
            >
              {isListening
                ? <MicOff className="w-4 h-4 text-red-500" />
                : <img src={micImg} alt="Voice search" className="w-4 h-4 object-contain" style={{ filter: "brightness(0)" }} />
              }
            </button>
          </form>
        </div>
      )}
    </header>

    <OtpModal open={otpModalOpen} onClose={() => setOtpModalOpen(false)} />
    <LocationPicker />
    </>
  );
}
