import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import Lottie from "lottie-react";
import {
  CheckCircle2, Minus, Plus, ShoppingBag, Trash2,
  MapPin, Banknote, CreditCard, ChevronRight, ClipboardList,
  X, Home, Briefcase, Tag, Navigation, Loader2, AlertCircle, Search,
  Clock, Zap, Ticket, ChevronDown, ChevronUp
} from "lucide-react";
import popperAnim from "@/assets/lottie/popper.json";
import emptyAddressAnim from "@/assets/lottie/empty-address.json";
import orderSuccessAnim from "@/assets/lottie/order-success.json";
import confettiAnim from "@/assets/lottie/confetti.json";
import emptyCartBagAnim from "@/assets/lottie/empty-cart-bag.json";
import { FishTokriLogo } from "@/components/storefront/FishTokriLogo";
import iconWalletImg from "@assets/wallet_1776953301704.png";
import headerCartImg from "@assets/shopping-bag_1774706595493.png";
import iconBinImg from "@assets/bin_1776927610776.png";
import iconHomeTypeImg from "@assets/home_1776927604826.png";
import iconBriefcaseImg from "@assets/briefcase_1776927648499.png";
import iconShippingHomeImg from "@assets/home_1776927604826.png";
import iconTimeImg from "@assets/time_1776949603776.png";
import iconScheduleImg from "@assets/schedule_1777284518383.png";
import notesIconImg from "@/assets/notes.png";
import giftCardIconImg from "@/assets/gift-card.png";
import tagIconImg from "@/assets/tag.png";
import { useCart } from "@/context/CartContext";
import { useCreateOrder } from "@/hooks/use-orders";
import { useCustomer } from "@/context/CustomerContext";
import { useCoupons } from "@/hooks/use-coupons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getHubHeaders } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CustomerAddress, Timeslot, Coupon } from "@shared/schema";

import fishImg from "@assets/Gemini_Generated_Image_w6wqkkw6wqkkw6wq_(1)_1772713077919.png";
import prawnsImg from "@assets/Gemini_Generated_Image_5xy0sd5xy0sd5xy0_1772713090650.png";
import chickenImg from "@assets/Gemini_Generated_Image_g0ecb4g0ecb4g0ec_1772713219972.png";
import muttonImg from "@assets/Gemini_Generated_Image_8fq0338fq0338fq0_1772713565349.png";
import masalaImg from "@assets/Gemini_Generated_Image_4e60a64e60a64e60_1772713888468.png";

const addressTypeColors: Record<string, string> = {
  house: "bg-blue-100 text-blue-700",
  office: "bg-purple-100 text-purple-700",
  other: "bg-amber-100 text-amber-700",
};

const TYPE_OPTIONS = [
  { value: "house" as const, iconImg: iconHomeTypeImg, icon: null, label: "House" },
  { value: "office" as const, iconImg: iconBriefcaseImg, icon: null, label: "Office" },
  { value: "other" as const, iconImg: null, icon: null, label: "Other" },
];

const emptyForm = {
  name: "", phone: "", building: "", street: "", area: "",
  pincode: "", type: "house" as "house" | "office" | "other",
  label: "", instructions: "",
};

interface PhotonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    osm_id?: number;
    name?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

async function photonSearch(query: string): Promise<PhotonFeature[]> {
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=en&bbox=68.7,8.4,97.3,37.1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? []).filter(
      (f: PhotonFeature) => f.properties.country === "India" || !f.properties.country
    );
  } catch {
    return [];
  }
}

function photonTitle(f: PhotonFeature): string {
  const p = f.properties;
  return p.name || p.locality || p.district || p.city || "";
}

function photonSubtitle(f: PhotonFeature): string {
  const p = f.properties;
  const parts: string[] = [];
  if (p.locality && p.locality !== photonTitle(f)) parts.push(p.locality);
  if (p.district && p.district !== photonTitle(f)) parts.push(p.district);
  if (p.city && p.city !== photonTitle(f)) parts.push(p.city);
  if (p.state) parts.push(p.state);
  return parts.slice(0, 3).join(", ");
}

export function CartDrawer() {
  const { isCartOpen, setIsCartOpen, items, updateQuantity, updateInstruction, totalPrice, clearCart, appliedCoupon, setAppliedCoupon, discountAmount } = useCart();
  const { mutate: createOrder, isPending } = useCreateOrder();
  const { customer } = useCustomer();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [isSuccess, setIsSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "online">("cod");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedTimeslotId, setSelectedTimeslotId] = useState<string | null>(null);
  const [expandedInstructions, setExpandedInstructions] = useState<Record<number, boolean>>({});

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState("");
  const [showAllCoupons, setShowAllCoupons] = useState(false);
  const [couponExpanded, setCouponExpanded] = useState(false);
  const [timeslotExpanded, setTimeslotExpanded] = useState(false);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [applyingCouponId, setApplyingCouponId] = useState<string | null>(null);

  const { data: allCoupons = [] } = useCoupons();

  // Per-user coupon usage from the server (only fetched when logged in and cart is open)
  const { data: userCouponUsage = {} } = useQuery<Record<string, { usedCount: number; limit: number; isExhausted: boolean; message: string }>>({
    queryKey: ["/api/coupons/user-usage"],
    enabled: isCartOpen && !!customer,
    staleTime: 0,
  });

  // Collect unique coupon IDs across all cart items
  const allCartCouponIds = [...new Set(items.flatMap(item => (item as any).couponIds ?? []))];
  const cartCoupons = allCoupons.filter(c => allCartCouponIds.includes(c.id));

  const isCouponExhausted = (c: Coupon) => !!customer && !!(userCouponUsage[c.code]?.isExhausted);
  const isCouponApplicable = (c: Coupon) => c.isActive && c.minOrderAmount <= totalPrice && !isCouponExhausted(c);
  // Hide exhausted coupons entirely from the list
  const visibleCartCoupons = cartCoupons.filter(c => !isCouponExhausted(c));

  const validateCouponViaApi = async (code: string): Promise<{ valid: boolean; message: string }> => {
    const res = await fetch("/api/coupon/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHubHeaders() },
      body: JSON.stringify({ couponCode: code, cartTotal: totalPrice, userId: customer?.phone ?? null }),
    });
    return res.json();
  };

  const applyCartCoupon = async (coupon: Coupon) => {
    // Check exhaustion first (client-side, from pre-fetched user usage)
    if (isCouponExhausted(coupon)) {
      setCouponError(userCouponUsage[coupon.code]?.message || "Coupon limit reached");
      return;
    }
    if (coupon.minOrderAmount > totalPrice) {
      const needed = coupon.minOrderAmount - totalPrice;
      setCouponError(`Add ₹${needed} more to your cart to use this coupon`);
      return;
    }
    setIsApplyingCoupon(true);
    setApplyingCouponId(coupon.id);
    setCouponError("");
    try {
      const result = await validateCouponViaApi(coupon.code);
      if (result.valid) {
        setAppliedCoupon(coupon);
        setCouponInput("");
      } else {
        const msg = result.message || "";
        const isUsageMsg = msg.toLowerCase().includes("usage limit") || msg.toLowerCase().includes("reached its");
        setCouponError(isUsageMsg ? "Invalid coupon code" : msg || "Coupon could not be applied");
      }
    } catch {
      setCouponError("Failed to validate coupon. Please try again.");
    } finally {
      setIsApplyingCoupon(false);
      setApplyingCouponId(null);
    }
  };

  const applyFromInput = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const coupon = cartCoupons.find(c => c.code === code);
    if (!coupon) {
      setCouponError("This code is not valid for items in your cart");
      return;
    }
    await applyCartCoupon(coupon);
  };

  // Clear coupon input when cart is emptied
  useEffect(() => {
    if (items.length === 0) {
      setCouponError("");
      setCouponInput("");
    }
  }, [items.length]);

  const { data: timeslots = [], isLoading: timeslotsLoading } = useQuery<Timeslot[]>({
    queryKey: ["/api/timeslots"],
    enabled: isCartOpen,
  });

  const parseTimeStr = useCallback((timeStr: string): Date | null => {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(" ");
    const [hStr, mStr] = parts[0].split(":");
    const period = parts[1]?.toUpperCase();
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return null;
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }, []);

  const isSlotAvailable = useCallback((slot: Timeslot): boolean => {
    if (slot.isInstant) return true;
    const now = new Date();
    // If slot has a startTime, hide it once current time has reached or passed it
    if (slot.startTime) {
      const slotStart = parseTimeStr(slot.startTime);
      if (slotStart && now >= slotStart) return false;
    }
    // Fallback: if no startTime, use endTime
    if (!slot.startTime && slot.endTime) {
      const slotEnd = parseTimeStr(slot.endTime);
      if (slotEnd && now >= slotEnd) return false;
    }
    return true;
  }, [parseTimeStr]);

  const availableTimeslots = timeslots.filter(isSlotAvailable);
  const selectedTimeslot = availableTimeslots.find(t => t.id === selectedTimeslotId) ?? null;

  useEffect(() => {
    if (selectedTimeslotId && !availableTimeslots.find(t => t.id === selectedTimeslotId)) {
      setSelectedTimeslotId(null);
    }
  }, [availableTimeslots, selectedTimeslotId]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [geoFilling, setGeoFilling] = useState(false);
  const [geoFillStatus, setGeoFillStatus] = useState<"idle" | "success" | "error">("idle");
  const [geoFillMessage, setGeoFillMessage] = useState("");

  const [locSearch, setLocSearch] = useState("");
  const [locResults, setLocResults] = useState<PhotonFeature[]>([]);
  const [locSearching, setLocSearching] = useState(false);
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const locTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (locTimeoutRef.current) clearTimeout(locTimeoutRef.current);
    const q = locSearch.trim();
    if (q.length < 2) {
      setLocResults([]);
      setLocSearching(false);
      setShowLocDropdown(q.length > 0);
      return;
    }
    setLocSearching(true);
    setShowLocDropdown(true);
    locTimeoutRef.current = setTimeout(async () => {
      const results = await photonSearch(q);
      setLocResults(results);
      setLocSearching(false);
    }, 350);
    return () => { if (locTimeoutRef.current) clearTimeout(locTimeoutRef.current); };
  }, [locSearch]);

  const handleLocResultSelect = useCallback((feature: PhotonFeature) => {
    const p = feature.properties;

    // area fields: locality → district → city (never use p.name here — that's the place name)
    const area = p.locality || p.district || p.city || "";
    const pincode = p.postcode?.replace(/\s/g, "") || "";
    const street = p.street || "";

    // p.name is the specific named place (e.g. "Hubtown Greenwoods") → Building/Floor
    // Only use it if it's different from the derived area (i.e. it's a POI / complex name, not just a locality)
    const placeName = p.name && p.name !== area ? p.name : "";

    setAddForm(f => ({
      ...f,
      building: placeName || f.building,
      street: street || f.street,
      area: area || f.area,
      pincode: pincode || f.pincode,
    }));
    setLocSearch("");
    setLocResults([]);
    setShowLocDropdown(false);
    setGeoFillStatus("success");
    const summary = [placeName, street, area, pincode].filter(Boolean).join(", ");
    setGeoFillMessage(`Auto-filled: ${summary || "please verify the fields below"}`);
  }, []);

  const savedAddresses: CustomerAddress[] = customer?.addresses ?? [];

  const activeAddressId = selectedAddressId ?? (savedAddresses[0]?.id || null);

  const getFallbackImage = (category: string) => {
    switch (category) {
      case "Prawns": return prawnsImg;
      case "Chicken": return chickenImg;
      case "Mutton": return muttonImg;
      case "Masalas": return masalaImg;
      case "Combo": return fishImg;
      default: return fishImg;
    }
  };

  const openAddForm = () => {
    setAddForm({
      ...emptyForm,
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
    });
    setGeoFillStatus("idle");
    setGeoFillMessage("");
    setLocSearch("");
    setLocResults([]);
    setShowLocDropdown(false);
    setShowAddForm(true);
    setTimeout(() => locInputRef.current?.focus(), 250);
  };

  const handleAutoFillLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setGeoFillStatus("error");
      setGeoFillMessage("Your browser doesn't support location detection.");
      return;
    }
    setGeoFilling(true);
    setGeoFillStatus("idle");

    // Same geolocation options as the header location picker for consistent accuracy
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Same Nominatim URL as the header – no zoom/accept-language params which cause inconsistency
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const addr = data?.address ?? {};

          const pincode = addr.postcode?.replace(/\s/g, "") ?? "";

          // Same priority chain the header uses for postcode, extended for area/street fields
          const area =
            addr.suburb ||
            addr.neighbourhood ||
            addr.quarter ||
            addr.city_district ||
            addr.residential ||
            addr.hamlet ||
            addr.city ||
            addr.town ||
            addr.village ||
            "";

          const street = [addr.house_number, addr.road].filter(Boolean).join(", ") || addr.pedestrian || "";

          setAddForm(f => ({
            ...f,
            pincode: pincode || f.pincode,
            area: area || f.area,
            street: street || f.street,
          }));

          const filled = [area, pincode].filter(Boolean).join(", ");
          const city = addr.city || addr.town || addr.state_district || "";
          setGeoFillStatus("success");
          setGeoFillMessage(`Location detected: ${filled || city || "Please verify the fields below"}`);
        } catch {
          setGeoFillStatus("error");
          setGeoFillMessage("Couldn't fetch location details. Please fill manually.");
        } finally {
          setGeoFilling(false);
        }
      },
      (err) => {
        setGeoFilling(false);
        setGeoFillStatus("error");
        setGeoFillMessage(
          err.code === err.PERMISSION_DENIED
            ? "Location access denied. Please allow it in your browser settings."
            : "Couldn't detect location. Please fill address manually."
        );
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const saveAddress = async () => {
    if (!addForm.name || !addForm.phone || !addForm.building || !addForm.area) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    const label =
      addForm.type === "other" ? (addForm.label || "Other") :
      addForm.type === "house" ? "Home" : "Office";

    setIsSavingAddress(true);
    try {
      const res = await fetch("/api/customer/me/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, label }),
      });
      if (!res.ok) throw new Error("Failed to save address");
      const updated = await res.json();
      queryClient.setQueryData(["/api/customer/me"], updated);
      const newAddr = updated.addresses?.[updated.addresses.length - 1];
      if (newAddr) setSelectedAddressId(newAddr.id);
      toast({ title: "Address saved!" });
      setShowAddForm(false);
      setAddForm(emptyForm);
    } catch {
      toast({ title: "Could not save address. Please try again.", variant: "destructive" });
    } finally {
      setIsSavingAddress(false);
    }
  };

  const placeOrder = () => {
    const selected = savedAddresses.find(a => a.id === activeAddressId);
    if (!selected) return;
    if (!selectedTimeslot) {
      toast({ title: "Please select a delivery time slot", variant: "destructive" });
      return;
    }
    const fullAddress = [selected.building, selected.street, selected.area, selected.pincode].filter(Boolean).join(", ");
    const orderItems = items.map(i => ({ productId: i.originalId ?? String(i.id), quantity: i.quantity, name: i.name, price: i.price, imageUrl: i.imageUrl ?? null }));
    const slotLabel = selectedTimeslot.isInstant
      ? "Instant Delivery (Porter)"
      : `${selectedTimeslot.label} (${selectedTimeslot.startTime} – ${selectedTimeslot.endTime})`;
    createOrder(
      {
        customerName: selected.name || customer?.name || "",
        phone: selected.phone || customer?.phone || "",
        deliveryArea: selected.area,
        address: fullAddress,
        notes: selected.instructions,
        items: orderItems,
        deliveryType: selectedTimeslot.isInstant ? "instant" : "slot",
        timeslotLabel: slotLabel,
        instantDeliveryCharge: selectedTimeslot.isInstant ? selectedTimeslot.extraCharge : null,
        couponCode: appliedCoupon?.code ?? null,
        discountAmount: discountAmount > 0 ? discountAmount : null,
        paymentMethod: paymentMethod === "online" ? "upi" : "cod",
      },
      { onSuccess: () => { setIsSuccess(true); clearCart(); } }
    );
  };

  const handleClose = (open: boolean) => {
    if (!open && isSuccess) setTimeout(() => setIsSuccess(false), 300);
    setIsCartOpen(open);
  };

  const savedTotal = items.reduce((acc, item) => {
    const original = Math.round(item.price / 0.9);
    return acc + (original - item.price) * item.quantity;
  }, 0);

  return (
    <>
      <Sheet open={isCartOpen} onOpenChange={handleClose}>
        <SheetContent className={`w-full sm:max-w-md flex flex-col h-full bg-white border-l border-border/30 p-0 overflow-hidden font-sans ${isSuccess ? "[&>button]:hidden" : ""}`}>
          {isSuccess ? (
            <div className="relative flex flex-col items-center justify-start h-full p-6 text-center overflow-hidden">
              <div className="pointer-events-none absolute inset-0 z-0">
                <Lottie animationData={confettiAnim} loop autoplay style={{ width: "100%", height: "100%" }} />
              </div>
              <div className="relative z-10 mt-4 mb-8">
                <FishTokriLogo className="h-16 w-auto" />
              </div>
              <div className="relative z-10 w-40 h-40 -mb-2">
                <Lottie animationData={orderSuccessAnim} loop={false} autoplay style={{ width: "100%", height: "100%" }} />
              </div>
              <h2 className="relative z-10 text-2xl font-bold text-foreground mb-2">Order Placed!</h2>
              <p className="relative z-10 text-muted-foreground text-base mb-8 max-w-[260px]">
                Thank you! We'll contact you shortly to confirm your delivery.
              </p>
              <Button
                onClick={() => handleClose(false)}
                size="lg"
                className="relative z-10 w-full max-w-[220px] !rounded-full font-semibold bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20"
              >
                Back to Store
              </Button>
            </div>
          ) : (
            <>
              <SheetHeader className="px-5 py-4 border-b border-border/30 bg-white sticky top-0 z-10">
                <SheetTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <img src={headerCartImg} alt="Cart" className="w-5 h-5 object-contain" />
                  Order Summary
                </SheetTitle>
              </SheetHeader>

              {items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                  <div className="w-44 h-44 -mb-2">
                    <Lottie animationData={emptyCartBagAnim} loop autoplay style={{ width: "100%", height: "100%" }} />
                  </div>
                  <p className="text-lg font-semibold text-foreground">Your cart is empty</p>
                  <p className="text-sm mt-1 mb-6">Add some fresh items to get started</p>
                  <Button variant="outline" onClick={() => setIsCartOpen(false)} className="rounded-xl">
                    Continue Browsing
                  </Button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {savedTotal > 0 && (
                      <div className="mx-4 -mt-2 -mb-2 flex items-center justify-center px-2">
                        <div className="w-12 h-12 -mr-1 overflow-hidden flex items-center justify-center shrink-0">
                          <Lottie
                            animationData={popperAnim}
                            loop
                            autoplay
                            style={{ width: 96, height: 96 }}
                          />
                        </div>
                        <p className="text-sm font-semibold leading-tight">
                          <span style={{ color: "#F05B4E" }}>Congratulations!</span>
                          <span style={{ color: "#364F9F" }}> You've saved ₹{savedTotal}</span>
                        </p>
                      </div>
                    )}

                    <div className="px-4 pt-4 space-y-3">
                      {items.map(item => (
                        <div key={item.id} className="overflow-hidden" data-testid={`cart-item-${item.id}`}>
                          <div className="flex items-center gap-3 p-3">
                            <div className="w-20 h-20 overflow-hidden flex-shrink-0 rounded-xl border border-border/20">
                              {item.isCombo && item.comboImages && item.comboImages.length > 0 ? (
                                (() => {
                                  const imgs = item.comboImages!;
                                  const n = Math.min(imgs.length, 3);
                                  const slotPct = 100 / n;
                                  const widthPct = n === 1 ? 100 : slotPct + slotPct * 0.5;
                                  return (
                                    <div className="relative w-full h-full overflow-hidden">
                                      {imgs.slice(0, n).map((img, i) => (
                                        <div
                                          key={i}
                                          className="absolute top-0 bottom-0"
                                          style={{ left: `${i * slotPct}%`, width: `${widthPct}%`, zIndex: i }}
                                        >
                                          <img src={img} alt="" className="w-full h-full object-cover" />
                                          {i < n - 1 && (
                                            <div className="absolute top-0 right-0 bottom-0 w-4 bg-gradient-to-r from-transparent to-black/20" />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()
                              ) : (
                                <img src={item.imageUrl || getFallbackImage(item.category)} alt={item.name} className="w-full h-full object-cover" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-sm truncate">{item.name}</h4>
                              <p className="text-xs text-muted-foreground">{item.unit}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-bold text-primary">₹{item.price}</span>
                                {!item.isCombo && (
                                  <>
                                    <span className="text-xs text-muted-foreground line-through">₹{Math.round(item.price / 0.9)}</span>
                                    <span className="text-[10px] font-semibold text-emerald-600">10% off</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 bg-slate-50 rounded-full px-2 py-1 border border-slate-100">
                              <button className="h-6 w-6 rounded-full hover:bg-white flex items-center justify-center" onClick={() => updateQuantity(item.id, item.quantity - 1)} data-testid={`button-decrease-${item.id}`}>
                                {item.quantity === 1
                                  ? <img src={iconBinImg} alt="Remove" className="w-3 h-3 object-contain" style={{ filter: "brightness(0)" }} />
                                  : <Minus className="w-3 h-3 text-slate-600" />}
                              </button>
                              <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
                              <button className="h-6 w-6 rounded-full hover:bg-white flex items-center justify-center" onClick={() => updateQuantity(item.id, item.quantity + 1)} data-testid={`button-increase-${item.id}`}>
                                <Plus className="w-3 h-3 text-slate-600" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Coupon Section — collapsible */}
                    {cartCoupons.length > 0 && (
                      <div className="mx-4 mt-4 border border-border/40 rounded-2xl overflow-hidden">
                        {/* Header — always visible, tap to expand/collapse */}
                        <button
                          type="button"
                          onClick={() => setCouponExpanded(s => !s)}
                          className="w-full flex items-center gap-2.5 px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors"
                          data-testid="button-toggle-coupons"
                        >
                          <span
                            aria-hidden
                            className="w-5 h-5 shrink-0 inline-block"
                            style={{
                              backgroundColor: "#364F9F",
                              WebkitMaskImage: `url(${giftCardIconImg})`,
                              maskImage: `url(${giftCardIconImg})`,
                              WebkitMaskRepeat: "no-repeat",
                              maskRepeat: "no-repeat",
                              WebkitMaskSize: "contain",
                              maskSize: "contain",
                              WebkitMaskPosition: "center",
                              maskPosition: "center",
                            }}
                          />
                          <div className="flex-1 text-left min-w-0">
                            {appliedCoupon ? (
                              <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                                <span className="font-mono tracking-wider">{appliedCoupon.code}</span>
                                <span className="font-normal text-emerald-600">· saved ₹{discountAmount}</span>
                              </span>
                            ) : (
                              <span className="text-sm font-semibold text-foreground">
                                Offers Available
                              </span>
                            )}
                          </div>
                          {couponExpanded
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                        </button>

                        {/* Expanded body */}
                        {couponExpanded && (
                          <>
                            {/* Applied coupon banner */}
                            {appliedCoupon && (
                              <div className="flex items-center justify-between px-4 py-3 bg-emerald-600 border-t border-emerald-700">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    aria-hidden
                                    className="w-5 h-5 shrink-0 inline-block"
                                    style={{
                                      backgroundColor: "#ffffff",
                                      WebkitMaskImage: `url(${tagIconImg})`,
                                      maskImage: `url(${tagIconImg})`,
                                      WebkitMaskRepeat: "no-repeat",
                                      maskRepeat: "no-repeat",
                                      WebkitMaskSize: "contain",
                                      maskSize: "contain",
                                      WebkitMaskPosition: "center",
                                      maskPosition: "center",
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <span className="font-mono font-bold text-sm text-white tracking-wider">{appliedCoupon.code}</span>
                                    <p className="text-xs text-white/90">
                                      {appliedCoupon.type === "flat" ? `₹${discountAmount} off applied!` : `${appliedCoupon.discountValue}% off — you save ₹${discountAmount}!`}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => { setAppliedCoupon(null); setCouponError(""); }}
                                  className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 transition-colors ml-3"
                                  aria-label="Remove coupon"
                                  data-testid="button-remove-coupon"
                                >
                                  <img src={iconBinImg} alt="" className="w-3.5 h-3.5 object-contain" style={{ filter: "brightness(0) invert(1)" }} />
                                </button>
                              </div>
                            )}

                            {/* Manual code entry */}
                            {!appliedCoupon && (
                              <div className="px-4 py-3 border-t border-border/20">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={couponInput}
                                    onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                                    onKeyDown={e => e.key === "Enter" && applyFromInput()}
                                    placeholder="Enter coupon code"
                                    className="flex-1 h-9 px-4 text-sm font-mono font-semibold tracking-wider rounded-full border border-border/60 bg-muted/30 focus:outline-none focus:border-[#364F9F] placeholder:font-normal placeholder:tracking-normal"
                                    data-testid="input-coupon-code"
                                  />
                                  <button
                                    onClick={applyFromInput}
                                    disabled={!couponInput.trim() || isApplyingCoupon}
                                    className="px-5 h-9 rounded-full text-white text-xs font-bold disabled:opacity-40 transition-colors flex items-center gap-1.5"
                                    style={{ backgroundColor: "#364F9F" }}
                                    data-testid="button-apply-coupon"
                                  >
                                    {isApplyingCoupon ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                    Apply
                                  </button>
                                </div>
                                {couponError && (
                                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" /> {couponError}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Coupon list */}
                            <div className="divide-y divide-border/20 border-t border-border/20">
                              {(showAllCoupons ? visibleCartCoupons : visibleCartCoupons.slice(0, 3)).map(coupon => {
                                const exhausted = isCouponExhausted(coupon);
                                const applicable = isCouponApplicable(coupon);
                                const isApplied = appliedCoupon?.id === coupon.id;
                                const belowMin = !exhausted && coupon.minOrderAmount > totalPrice;
                                const needed = belowMin ? coupon.minOrderAmount - totalPrice : 0;
                                const usageInfo = customer ? userCouponUsage[coupon.code] : undefined;
                                const remaining = usageInfo && usageInfo.limit > 0
                                  ? usageInfo.limit - usageInfo.usedCount
                                  : null;
                                return (
                                  <div
                                    key={coupon.id}
                                    className={`flex items-center justify-between px-4 py-3 transition-colors ${applicable ? "bg-background hover:bg-muted/10" : "bg-muted/5 opacity-60"}`}
                                  >
                                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                      <span
                                        aria-hidden
                                        className="w-6 h-6 shrink-0 inline-block mt-0.5"
                                        style={{
                                          backgroundColor: applicable ? "#364F9F" : "#9CA3AF",
                                          WebkitMaskImage: `url(${tagIconImg})`,
                                          maskImage: `url(${tagIconImg})`,
                                          WebkitMaskRepeat: "no-repeat",
                                          maskRepeat: "no-repeat",
                                          WebkitMaskSize: "contain",
                                          maskSize: "contain",
                                          WebkitMaskPosition: "center",
                                          maskPosition: "center",
                                        }}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <span
                                          className={`font-mono font-bold text-xs tracking-wider rounded-full px-2.5 py-0.5 text-white inline-block ${applicable ? "" : "opacity-60"}`}
                                          style={{ backgroundColor: "#F05B4E" }}
                                        >
                                          {coupon.code}
                                        </span>
                                        <p className="text-xs text-muted-foreground mt-1 whitespace-normal break-words leading-snug">{coupon.description}</p>
                                        {exhausted && (
                                          <p className="text-[10px] text-red-500 mt-0.5 font-medium">Limit reached</p>
                                        )}
                                        {belowMin && coupon.minOrderAmount > 0 && (
                                          <p className="text-[10px] text-amber-600 mt-0.5 font-medium">Add ₹{needed} more to unlock</p>
                                        )}
                                      </div>
                                    </div>
                                    {(() => {
                                      const isThisApplying = applyingCouponId === coupon.id;
                                      return (
                                        <button
                                          onClick={() => { if (applicable && !isApplied && !isApplyingCoupon) { applyCartCoupon(coupon).then(() => setCouponExpanded(false)); } }}
                                          disabled={!applicable || isApplied || isApplyingCoupon || exhausted}
                                          className={`ml-3 shrink-0 text-xs font-bold px-3.5 py-1.5 rounded-full transition-colors flex items-center gap-1 ${
                                            isApplied
                                              ? "text-white cursor-default"
                                              : exhausted
                                                ? "bg-red-50 text-red-400 cursor-not-allowed"
                                                : applicable
                                                  ? "text-white"
                                                  : "bg-muted text-muted-foreground cursor-not-allowed"
                                          }`}
                                          style={
                                            isApplied
                                              ? { backgroundColor: "#047857" }
                                              : applicable && !exhausted
                                                ? { backgroundColor: "#364F9F" }
                                                : undefined
                                          }
                                        >
                                          {isThisApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                          {isApplied ? "Applied" : exhausted ? "Limit reached" : applicable ? "Apply" : "Locked"}
                                        </button>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                              {visibleCartCoupons.length > 3 && (
                                <button
                                  onClick={() => setShowAllCoupons(s => !s)}
                                  className="w-full py-2.5 text-xs text-primary font-semibold flex items-center justify-center gap-1 hover:bg-muted/10"
                                >
                                  {showAllCoupons ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> +{visibleCartCoupons.length - 3} more coupons</>}
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Bill Details */}
                    <div className="mx-4 mt-4 border border-dashed border-border/60 rounded-2xl p-4 space-y-2.5">
                      <h3 className="font-semibold text-foreground text-sm mb-3">Bill Details</h3>
                      {items.map(item => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground truncate mr-2">{item.name} × {item.quantity}</span>
                          <span className="font-medium flex-shrink-0">₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-dashed border-border/40 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium">₹{totalPrice}</span>
                        </div>
                        {discountAmount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-emerald-600 flex items-center gap-1">
                              <Tag className="w-3 h-3" /> Coupon ({appliedCoupon!.code})
                            </span>
                            <span className="font-semibold text-emerald-600">−₹{discountAmount}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Delivery fee</span>
                          {selectedTimeslot?.isInstant && (selectedTimeslot.extraCharge ?? 0) > 0 ? (
                            <span className="font-semibold text-amber-600">+₹{selectedTimeslot.extraCharge}</span>
                          ) : (
                            <span className="font-semibold text-emerald-600">FREE</span>
                          )}
                        </div>
                        {selectedTimeslot?.isInstant && (selectedTimeslot.extraCharge ?? 0) > 0 && (
                          <p className="text-[11px] text-amber-600/80 italic">Instant delivery via Porter — extra charges apply</p>
                        )}
                      </div>
                      <div className="pt-2 border-t border-border/40 flex justify-between items-center">
                        <span className="font-bold text-foreground">Total</span>
                        <div className="text-right">
                          {discountAmount > 0 && (
                            <p className="text-xs text-muted-foreground line-through">₹{totalPrice + (selectedTimeslot?.isInstant ? (selectedTimeslot.extraCharge ?? 0) : 0)}</p>
                          )}
                          <span className="text-lg font-bold text-primary">
                            ₹{totalPrice - discountAmount + (selectedTimeslot?.isInstant ? (selectedTimeslot.extraCharge ?? 0) : 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Shipping Address */}
                    <div className="px-4 mt-5 mb-2">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="w-4 h-4 inline-block"
                            style={{
                              backgroundColor: "#364F9F",
                              WebkitMaskImage: `url(${iconShippingHomeImg})`,
                              maskImage: `url(${iconShippingHomeImg})`,
                              WebkitMaskRepeat: "no-repeat",
                              maskRepeat: "no-repeat",
                              WebkitMaskSize: "contain",
                              maskSize: "contain",
                              WebkitMaskPosition: "center",
                              maskPosition: "center",
                            }}
                          />
                          Shipping Address
                        </h3>
                        {customer && !showAddForm ? (
                          <Button
                            size="sm"
                            onClick={openAddForm}
                            className="rounded-full h-8 px-3 text-xs text-white gap-1 hover:opacity-90"
                            style={{ backgroundColor: "#364F9F" }}
                            data-testid="button-add-address"
                          >
                            <Plus className="w-3 h-3" /> Add Address
                          </Button>
                        ) : null}
                      </div>

                      {/* Inline Add Address form */}
                      {customer && showAddForm && (
                        <div className="space-y-3 mb-4 pb-4 border-b border-slate-100">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-foreground">New Address</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setShowAddForm(false); setAddForm(emptyForm); }}
                              className="w-7 h-7 rounded-full text-muted-foreground"
                              data-testid="button-close-address-form"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Full Name *</Label>
                              <input
                                value={addForm.name}
                                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Recipient name"
                                className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                                data-testid="input-address-name"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Phone *</Label>
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={10}
                                value={addForm.phone}
                                onChange={e => setAddForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                                placeholder="10-digit mobile"
                                className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                                data-testid="input-address-phone"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Building / Flat No *</Label>
                            <input
                              value={addForm.building}
                              onChange={e => setAddForm(f => ({ ...f, building: e.target.value }))}
                              placeholder="Wing A, Flat 302, Building Name"
                              className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                              data-testid="input-address-building"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Street / Locality</Label>
                            <input
                              value={addForm.street}
                              onChange={e => setAddForm(f => ({ ...f, street: e.target.value }))}
                              placeholder="Street name or society"
                              className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                              data-testid="input-address-street"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Area / Suburb *</Label>
                              <input
                                value={addForm.area}
                                onChange={e => setAddForm(f => ({ ...f, area: e.target.value }))}
                                placeholder="e.g. Thane West"
                                className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                                data-testid="input-address-area"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Pincode</Label>
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={6}
                                value={addForm.pincode}
                                onChange={e => setAddForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                                placeholder="400601"
                                className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                                data-testid="input-address-pincode"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Address Type</Label>
                            <div className="flex gap-2">
                              {TYPE_OPTIONS.map(opt => {
                                const selected = addForm.type === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setAddForm(f => ({
                                      ...f,
                                      type: opt.value,
                                      label: opt.value === "house" ? "Home" : opt.value === "office" ? "Office" : f.label,
                                    }))}
                                    style={{ backgroundColor: selected ? "#364F9F" : "#F05B4E", borderColor: selected ? "#364F9F" : "#F05B4E" }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border text-white transition-all hover:opacity-90"
                                    data-testid={`button-address-type-${opt.value}`}
                                  >
                                    {opt.iconImg && (
                                      <img src={opt.iconImg} alt="" className="w-3.5 h-3.5 object-contain brightness-0 invert" />
                                    )}
                                    {opt.icon}
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                            {addForm.type === "other" && (
                              <input
                                value={addForm.label}
                                onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                                placeholder='Custom label (e.g. "Parents Home")'
                                className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                                data-testid="input-address-custom-label"
                              />
                            )}
                          </div>
                          <div className="flex gap-2 pt-3">
                            <Button
                              onClick={() => { setShowAddForm(false); setAddForm(emptyForm); }}
                              className="flex-1 rounded-xl text-white font-medium hover:opacity-90"
                              style={{ backgroundColor: "#F05B4E" }}
                              data-testid="button-cancel-address"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={saveAddress}
                              disabled={isSavingAddress}
                              className="flex-1 rounded-xl text-white font-medium hover:opacity-90"
                              style={{ backgroundColor: "#364F9F" }}
                              data-testid="button-save-address"
                            >
                              {isSavingAddress ? <><Loader2 className="w-4 h-4 animate-spin mr-2 inline" />Saving...</> : "Save Address"}
                            </Button>
                          </div>
                        </div>
                      )}

                      {!customer ? (
                        <button
                          onClick={() => { setIsCartOpen(false); navigate("/"); }}
                          className="w-full border-2 border-dashed border-border/50 rounded-2xl p-4 text-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          <MapPin className="w-6 h-6 mx-auto mb-1 opacity-40" />
                          <p className="text-sm font-medium">Please log in to use saved addresses</p>
                          <p className="text-xs mt-1 opacity-70">Tap to sign in with your phone</p>
                        </button>
                      ) : savedAddresses.length === 0 ? (
                        <button onClick={openAddForm} className="w-full border-2 border-dashed border-border/50 rounded-2xl p-4 flex flex-col items-center text-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors" data-testid="button-add-first-address">
                          <Lottie animationData={emptyAddressAnim} loop className="w-16 h-16" />
                          <p className="text-sm font-medium">+ Add delivery address</p>
                        </button>
                      ) : (
                        <div className="space-y-2">
                          {savedAddresses.map(addr => (
                            <button
                              key={addr.id}
                              type="button"
                              onClick={() => setSelectedAddressId(addr.id)}
                              className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all ${activeAddressId === addr.id ? "border-primary bg-primary/5" : "border-border/40 bg-white hover:border-primary/30"}`}
                              data-testid={`address-option-${addr.id}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${activeAddressId === addr.id ? "border-primary" : "border-slate-300"}`}>
                                  {activeAddressId === addr.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-semibold text-sm text-foreground">{addr.name || customer?.name}</span>
                                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${addressTypeColors[addr.type] || "bg-slate-100 text-slate-500"}`}>
                                      {addr.label}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{addr.phone || customer?.phone}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                    {[addr.building, addr.street, addr.area, addr.pincode].filter(Boolean).join(", ")}
                                  </p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Delivery Time Slot */}
                    <div className="px-4 mt-5 mb-2">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="w-4 h-4 inline-block"
                            style={{
                              backgroundColor: "#364F9F",
                              WebkitMaskImage: `url(${iconTimeImg})`,
                              maskImage: `url(${iconTimeImg})`,
                              WebkitMaskRepeat: "no-repeat",
                              maskRepeat: "no-repeat",
                              WebkitMaskSize: "contain",
                              maskSize: "contain",
                              WebkitMaskPosition: "center",
                              maskPosition: "center",
                            }}
                          />
                          Select Time Slot
                        </h3>
                        {selectedTimeslot && (
                          selectedTimeslot.isInstant && (selectedTimeslot.extraCharge ?? 0) > 0
                            ? <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">+₹{selectedTimeslot.extraCharge}</span>
                            : <span className="text-xs font-semibold text-emerald-600">FREE</span>
                        )}
                      </div>

                      <div className="space-y-2">
                          {timeslotsLoading ? (
                            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" /> Loading slots...
                            </div>
                          ) : availableTimeslots.length === 0 ? (
                            <div className="py-4 text-center text-sm text-muted-foreground">
                              No slots available for today
                            </div>
                          ) : (
                            availableTimeslots.map(slot => {
                              const isSelected = selectedTimeslotId === slot.id;
                              return (
                              <div key={slot.id}>
                                <button
                                  type="button"
                                  onClick={() => { setSelectedTimeslotId(slot.id); setTimeslotExpanded(false); }}
                                  className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all ${isSelected ? (slot.isInstant ? "border-amber-500 bg-amber-50" : "border-[#364F9F] bg-[#364F9F]/5") : "border-border/40 bg-white hover:border-[#364F9F]/30"}`}
                                  data-testid={`timeslot-${slot.id}`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? (slot.isInstant ? "border-amber-500" : "border-[#364F9F]") : "border-slate-300"}`}>
                                      {isSelected && <div className={`w-2 h-2 rounded-full ${slot.isInstant ? "bg-amber-500" : "bg-[#364F9F]"}`} />}
                                    </div>
                                    <span className={`text-sm font-semibold flex-1 min-w-0 truncate ${slot.isInstant ? "text-amber-700" : "text-foreground"}`}>
                                      {slot.label}
                                      {slot.startTime && slot.endTime && (
                                        <span className="font-normal text-muted-foreground"> · {slot.startTime}–{slot.endTime}</span>
                                      )}
                                    </span>
                                    {slot.isInstant && (slot.extraCharge ?? 0) > 0 ? (
                                      <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">+₹{slot.extraCharge}</span>
                                    ) : !slot.isInstant ? (
                                      <span className="text-xs font-semibold text-emerald-600 shrink-0">FREE</span>
                                    ) : null}
                                  </div>
                                </button>
                              </div>
                            );})
                          )}
                        </div>
                    </div>

                    {/* Payment Method */}
                    <div className="px-4 mt-5 mb-4 space-y-3">
                      <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="w-4 h-4 inline-block"
                          style={{
                            backgroundColor: "#364F9F",
                            WebkitMaskImage: `url(${iconWalletImg})`,
                            maskImage: `url(${iconWalletImg})`,
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                            WebkitMaskSize: "contain",
                            maskSize: "contain",
                            WebkitMaskPosition: "center",
                            maskPosition: "center",
                          }}
                        />
                        Payment Method
                      </h3>
                      <div className="space-y-2">
                        {[
                          { value: "cod", label: "Cash on Delivery" },
                          { value: "online", label: "UPI" },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPaymentMethod(opt.value as "cod" | "online")}
                            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${paymentMethod === opt.value ? "border-primary bg-primary/5" : "border-border/40 bg-white hover:border-primary/30"}`}
                            data-testid={`payment-${opt.value}`}
                          >
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentMethod === opt.value ? "border-primary" : "border-slate-300"}`}>
                              {paymentMethod === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                            <span className="text-sm font-medium text-foreground">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-4 border-t border-border/30 bg-white sticky bottom-0 z-10">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        {discountAmount > 0 && (
                          <p className="text-xs text-muted-foreground line-through">
                            ₹{totalPrice + (selectedTimeslot?.isInstant ? (selectedTimeslot.extraCharge ?? 0) : 0)}
                          </p>
                        )}
                        <p className="text-xl font-bold text-primary">
                          ₹{totalPrice - discountAmount + (selectedTimeslot?.isInstant ? (selectedTimeslot.extraCharge ?? 0) : 0)}
                        </p>
                        {discountAmount > 0 && (
                          <p className="text-[10px] text-emerald-600 font-semibold">Saved ₹{discountAmount} with {appliedCoupon!.code}</p>
                        )}
                        {selectedTimeslot?.isInstant && (selectedTimeslot.extraCharge ?? 0) > 0 && (
                          <p className="text-[10px] text-amber-600">incl. ₹{selectedTimeslot.extraCharge} instant delivery</p>
                        )}
                      </div>
                      <Button
                        onClick={placeOrder}
                        disabled={isPending || !customer || savedAddresses.length === 0}
                        className="h-12 px-8 !rounded-full font-bold bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20 flex items-center gap-2"
                        data-testid="button-place-order"
                      >
                        {isPending ? "Placing..." : <>Proceed <ChevronRight className="w-4 h-4" /></>}
                      </Button>
                    </div>
                    {!customer && (
                      <p className="text-xs text-center text-muted-foreground mt-2">Please log in to place an order</p>
                    )}
                    {customer && savedAddresses.length === 0 && (
                      <p className="text-xs text-center text-muted-foreground mt-2">Please add a delivery address to proceed</p>
                    )}
                    {customer && savedAddresses.length > 0 && !selectedTimeslot && (
                      <p className="text-xs text-center text-muted-foreground mt-2">Please select a delivery time slot</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Address Dialog (deprecated - now inline in drawer) */}
      <Dialog open={false} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-2xl w-full rounded-2xl p-0 gap-0 flex flex-col max-h-[92vh]">
          <DialogHeader className="px-6 py-5 border-b border-border/30 shrink-0">
            <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> Add Delivery Address
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">

            {/* Location Search + Current Location */}
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                {locSearching ? (
                  <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin pointer-events-none" />
                ) : (
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                )}
                <input
                  ref={locInputRef}
                  type="text"
                  value={locSearch}
                  onChange={e => { setLocSearch(e.target.value); setGeoFillStatus("idle"); setGeoFillMessage(""); }}
                  onFocus={() => locSearch.trim().length >= 2 && setShowLocDropdown(true)}
                  placeholder="Search area, locality, landmark or pincode..."
                  className="w-full h-12 pl-10 pr-10 rounded-2xl border-2 border-border/60 focus:border-primary/60 bg-slate-50 focus:bg-white text-sm font-medium placeholder:text-muted-foreground/60 outline-none transition-all"
                  data-testid="input-location-search-address"
                />
                {locSearch && (
                  <button
                    onClick={() => { setLocSearch(""); setLocResults([]); setShowLocDropdown(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center hover:bg-muted-foreground/30 transition-colors"
                  >
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}

                {/* Search Dropdown */}
                {showLocDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-border/50 shadow-2xl z-20 overflow-hidden">
                    {/* Use current location — always at top of dropdown */}
                    <button
                      onClick={() => { setShowLocDropdown(false); setLocSearch(""); handleAutoFillLocation(); }}
                      disabled={geoFilling}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-primary/5 transition-colors border-b border-border/30"
                    >
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Navigation className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-primary">Use current location</p>
                        <p className="text-xs text-muted-foreground">Auto-detect & fill area & pincode</p>
                      </div>
                    </button>

                    {locSearching ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Finding locations...</span>
                      </div>
                    ) : locResults.length === 0 && locSearch.trim().length >= 2 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">No results found. Try a different search term.</div>
                    ) : (
                      <div className="max-h-[220px] overflow-y-auto">
                        {locResults.map((feature, i) => {
                          const title = photonTitle(feature);
                          const subtitle = photonSubtitle(feature);
                          const postcode = feature.properties.postcode;
                          return (
                            <button
                              key={`${feature.properties.osm_id ?? i}`}
                              onClick={() => handleLocResultSelect(feature)}
                              className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors border-b border-border/10 last:border-0"
                            >
                              <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
                                {postcode && (
                                  <p className="text-[11px] text-primary/70 font-medium mt-0.5">Pincode: {postcode}</p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Persistent Use Current Location button */}
              <button
                type="button"
                onClick={handleAutoFillLocation}
                disabled={geoFilling}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="button-use-current-location"
              >
                {geoFilling ? (
                  <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                ) : (
                  <Navigation className="w-5 h-5 text-primary shrink-0" />
                )}
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-primary leading-tight">
                    {geoFilling ? "Detecting location..." : "Use current location"}
                  </p>
                  <p className="text-xs text-muted-foreground">Auto-fill area & pincode</p>
                </div>
              </button>

              {geoFillStatus === "success" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{geoFillMessage}</span>
                </div>
              )}
              {geoFillStatus === "error" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{geoFillMessage}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-xs text-muted-foreground font-medium">or enter manually</span>
              <div className="flex-1 h-px bg-border/40" />
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name *</Label>
                <Input
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Recipient name"
                  className="rounded-xl h-11 border-border/60"
                  data-testid="input-address-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone *</Label>
                <Input
                  value={addForm.phone}
                  onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="10-digit number"
                  type="tel"
                  className="rounded-xl h-11 border-border/60"
                  data-testid="input-address-phone"
                />
              </div>
            </div>

            {/* Address type */}
            <div className="flex gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAddForm(f => ({ ...f, type: opt.value }))}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    addForm.type === opt.value
                      ? "bg-foreground text-white border-foreground"
                      : "bg-white text-muted-foreground border-border/50 hover:border-foreground/30"
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>

            {addForm.type === "other" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Save As *</Label>
                <Input
                  value={addForm.label}
                  onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Parents Home, Gym"
                  className="rounded-xl h-11 border-border/60"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Building / Floor *</Label>
              <Input
                value={addForm.building}
                onChange={e => setAddForm(f => ({ ...f, building: e.target.value }))}
                placeholder="e.g. Wing A, Flat 402"
                className="rounded-xl h-11 border-border/60"
                data-testid="input-address-building"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Street</Label>
              <Input
                value={addForm.street}
                onChange={e => setAddForm(f => ({ ...f, street: e.target.value }))}
                placeholder="e.g. MG Road"
                className="rounded-xl h-11 border-border/60"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Area *</Label>
                <Input
                  value={addForm.area}
                  onChange={e => setAddForm(f => ({ ...f, area: e.target.value }))}
                  placeholder="e.g. Andheri West"
                  className="rounded-xl h-11 border-border/60"
                  data-testid="input-address-area"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pincode</Label>
                <Input
                  value={addForm.pincode}
                  onChange={e => setAddForm(f => ({ ...f, pincode: e.target.value }))}
                  placeholder="400001"
                  type="tel"
                  maxLength={6}
                  className="rounded-xl h-11 border-border/60"
                />
              </div>
            </div>

          </div>

          <div className="px-6 py-5 border-t border-border/30 flex gap-3 shrink-0">
            <Button variant="outline" onClick={() => setShowAddForm(false)} className="flex-1 rounded-xl h-12">
              Cancel
            </Button>
            <Button
              onClick={saveAddress}
              disabled={isSavingAddress}
              className="flex-1 rounded-xl h-12 font-bold bg-primary text-white"
              data-testid="button-save-address"
            >
              {isSavingAddress ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : "Save Address"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
