import { useParams, useLocation } from "wouter";
import { useCart } from "@/context/CartContext";
import { useCoupons } from "@/hooks/use-coupons";
import { Header } from "@/components/storefront/Header";
import { CartDrawer } from "@/components/storefront/CartDrawer";
import { ProductCard } from "@/components/storefront/ProductCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ShoppingBag, Check, Copy, ChefHat,
  ExternalLink, Star, Sparkles, ShoppingBasket,
} from "lucide-react";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SwipeHint } from "@/components/storefront/SwipeHint";
import type { Combo, Product } from "@shared/schema";
import { getActiveHubDb } from "@/lib/queryClient";
import { getDummyDetail } from "@/lib/productDummyData";

import weighScaleIcon from "@assets/weight-scale_1774801344716.png";
import piecesIcon from "@assets/cutlery_1774801395283.png";
import servesIcon from "@assets/hot-food_1774801420499.png";
import giftCardIconImg from "@/assets/gift-card.png";
import tagIconImg from "@/assets/tag.png";
import checkedIconImg from "@/assets/checked.png";

import fishImg from "@assets/Gemini_Generated_Image_w6wqkkw6wqkkw6wq_(1)_1772713077919.png";
import prawnsImg from "@assets/Gemini_Generated_Image_5xy0sd5xy0sd5xy0_1772713090650.png";
import chickenImg from "@assets/Gemini_Generated_Image_g0ecb4g0ecb4g0ec_1772713219972.png";
import muttonImg from "@assets/Gemini_Generated_Image_8fq0338fq0338fq0_1772713565349.png";
import masalaImg from "@assets/Gemini_Generated_Image_4e60a64e60a64e60_1772713888468.png";

function getFallbackImage(category: string) {
  switch (category) {
    case "Prawns": return prawnsImg;
    case "Chicken": return chickenImg;
    case "Mutton": return muttonImg;
    case "Masalas": return masalaImg;
    default: return fishImg;
  }
}

function ComboHeroImage({ productImages, productCategories, name, tags }: {
  productImages: string[];
  productCategories: string[];
  name: string;
  tags: string[];
}) {
  const images = productImages.length > 0
    ? productImages
    : productCategories.map(getFallbackImage);

  const n = Math.min(images.length, 3);
  const slotPct = 100 / n;
  const widthPct = n === 1 ? 100 : slotPct + slotPct * 0.5;

  return (
    <div className="relative">
      <div className="aspect-[4/3] sm:aspect-square rounded-3xl overflow-hidden border border-border/20 shadow-xl bg-muted/10">
        {n === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-7xl bg-gradient-to-br from-primary/5 to-accent/5">🐟</div>
        ) : (
          <div className="relative w-full h-full overflow-hidden">
            {images.slice(0, n).map((img, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0"
                style={{ left: `${i * slotPct}%`, width: `${widthPct}%`, zIndex: i }}
              >
                <img src={img} alt={`${name} item ${i + 1}`} className="w-full h-full object-cover" />
                {i < n - 1 && (
                  <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-black/20" />
                )}
              </div>
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          </div>
        )}
      </div>

      {/* Combo badge */}
      <div className="absolute bottom-4 right-4">
        <span className="text-xs font-bold bg-black/60 text-white px-3 py-1.5 rounded-full backdrop-blur-sm flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Combo Pack
        </span>
      </div>
    </div>
  );
}

function CouponCard({ code, desc }: { code: string; desc: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-background hover:bg-muted/10 transition-colors">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span
          aria-hidden
          className="w-6 h-6 shrink-0 inline-block mt-0.5"
          style={{
            backgroundColor: "#364F9F",
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
            className="font-mono font-bold text-xs tracking-wider rounded-full px-2.5 py-0.5 text-white inline-block"
            style={{ backgroundColor: "#F05B4E" }}
          >
            {code}
          </span>
          <p className="text-xs text-muted-foreground mt-1 whitespace-normal break-words leading-snug">{desc}</p>
        </div>
      </div>
      <button
        onClick={copy}
        className="flex items-center gap-1 text-xs font-semibold ml-3 shrink-0 transition-colors hover:opacity-80"
        style={{ color: "#364F9F" }}
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function IncludedProductCard({ item, product, comboDiscountRatio }: {
  item: { productId: string; label: string };
  product?: Product;
  comboDiscountRatio: number;
}) {
  const category = product?.category ?? "Fish";
  const img = product?.imageUrl || getFallbackImage(category);

  const basePrice = product?.originalPrice ?? product?.price ?? null;
  const showPricing = basePrice != null && comboDiscountRatio < 1 && comboDiscountRatio > 0;
  const discountedPrice = showPricing ? Math.round(basePrice * comboDiscountRatio) : null;

  const dummy = product ? getDummyDetail(product.category) : null;
  const piecesText = product?.pieces || dummy?.pieces;
  const servesText = product?.serves || dummy?.serves;
  const hasGrossOrNet = !!(product?.grossWeight || product?.netWeight);
  const hasStats = !!(piecesText || servesText || hasGrossOrNet);

  return (
    <Link href={product ? `/product/${product.id}` : "#"}>
      <div className="flex items-start gap-4 py-4 group cursor-pointer">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 bg-muted/30 border border-border/30">
          <img src={img} alt={item.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-base sm:text-lg font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
              {item.label}
            </span>
            {product && (
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
            )}
          </div>
          {product && (
            <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
              {product.category}
              {product.unit ? ` · ${product.unit}` : product.weight ? ` · ${product.weight}` : ""}
            </p>
          )}
          {showPricing && discountedPrice != null && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-base sm:text-lg font-bold text-foreground">₹{discountedPrice}</span>
              <span className="text-sm text-muted-foreground line-through">₹{basePrice}</span>
            </div>
          )}

          {/* Pieces / Serves / Weight — wraps on mobile so nothing collides or hides */}
          {hasStats && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-black dark:text-white">
              {piecesText && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    aria-hidden
                    className="w-4 h-4 sm:w-5 sm:h-5 inline-block shrink-0 bg-black dark:bg-white"
                    style={{
                      WebkitMaskImage: `url(${piecesIcon})`,
                      maskImage: `url(${piecesIcon})`,
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                      WebkitMaskSize: "contain",
                      maskSize: "contain",
                      WebkitMaskPosition: "center",
                      maskPosition: "center",
                    }}
                  />
                  <span className="text-xs sm:text-sm font-semibold leading-tight">{piecesText}</span>
                </div>
              )}

              {servesText && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    aria-hidden
                    className="w-4 h-4 sm:w-5 sm:h-5 inline-block shrink-0 bg-black dark:bg-white"
                    style={{
                      WebkitMaskImage: `url(${servesIcon})`,
                      maskImage: `url(${servesIcon})`,
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                      WebkitMaskSize: "contain",
                      maskSize: "contain",
                      WebkitMaskPosition: "center",
                      maskPosition: "center",
                    }}
                  />
                  <span className="text-xs sm:text-sm font-semibold leading-tight">{servesText}</span>
                </div>
              )}

              {hasGrossOrNet && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    aria-hidden
                    className="w-4 h-4 sm:w-5 sm:h-5 inline-block shrink-0 bg-black dark:bg-white"
                    style={{
                      WebkitMaskImage: `url(${weighScaleIcon})`,
                      maskImage: `url(${weighScaleIcon})`,
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                      WebkitMaskSize: "contain",
                      maskSize: "contain",
                      WebkitMaskPosition: "center",
                      maskPosition: "center",
                    }}
                  />
                  <div className="flex items-baseline gap-1 leading-tight text-xs sm:text-sm font-semibold">
                    {product?.grossWeight && (
                      <span>
                        {product.grossWeight}
                        <span className="font-normal ml-0.5">gross</span>
                      </span>
                    )}
                    {product?.grossWeight && product?.netWeight && (
                      <span className="font-normal opacity-50">/</span>
                    )}
                    {product?.netWeight && (
                      <span>
                        {product.netWeight}
                        <span className="font-normal ml-0.5">net</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function ComboImages({ images }: { images: string[] }) {
  const n = images.length;
  if (n === 0) return <div className="w-full h-full flex items-center justify-center text-4xl">🎁</div>;
  const slotPct = 100 / n;
  const widthPct = n === 1 ? 100 : slotPct + slotPct * 0.45;
  return (
    <div className="relative w-full h-full overflow-hidden">
      {images.map((img, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0"
          style={{ left: `${i * slotPct}%`, width: `${widthPct}%`, zIndex: i }}
        >
          <img src={img} alt="" className="w-full h-full object-cover" />
          {i < n - 1 && (
            <div className="absolute top-0 right-0 bottom-0 w-4 bg-gradient-to-r from-transparent to-black/10" />
          )}
        </div>
      ))}
    </div>
  );
}

function ComboCard({ combo, productMap }: { combo: Combo; productMap: Record<string, Product> }) {
  const [, navigate] = useLocation();
  const savings = combo.originalPrice - combo.discountedPrice;
  const comboImages = combo.includes
    .map((inc) => {
      const product = productMap[inc.productId];
      return product?.imageUrl || (product ? getFallbackImage(product.category) : null);
    })
    .filter(Boolean) as string[];
  return (
    <div
      onClick={() => navigate(`/combo/${combo.id}`)}
      className="min-w-[200px] sm:min-w-[220px] snap-start bg-white dark:bg-card border border-border/30 rounded-2xl overflow-hidden hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group flex flex-col"
    >
      <div className="w-full h-36 bg-muted/20 overflow-hidden rounded-t-2xl">
        <ComboImages images={comboImages} />
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-xs font-bold text-primary uppercase tracking-wide">Combo</p>
        <h4 className="text-sm font-bold text-foreground leading-snug line-clamp-2">{combo.name}</h4>
        <div className="flex items-center gap-2 mt-auto pt-1">
          <span className="text-base font-bold text-foreground">₹{combo.discountedPrice}</span>
          <span className="text-xs text-muted-foreground line-through">₹{combo.originalPrice}</span>
        </div>
        {savings > 0 && (
          <p className="text-xs text-emerald-600 font-medium">Save ₹{savings}</p>
        )}
      </div>
    </div>
  );
}

export default function ComboDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { addToCart, setIsCartOpen } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const productRecipesScrollRef = useRef<HTMLDivElement>(null);
  const combosScrollRef = useRef<HTMLDivElement>(null);
  const similarScrollRef = useRef<HTMLDivElement>(null);

  const hubHeaders = getActiveHubDb() ? { "X-Hub-DB": getActiveHubDb()! } : {};

  const { data: combo, isLoading: comboLoading } = useQuery<Combo>({
    queryKey: ["/api/combos", id],
    queryFn: async () => {
      const res = await fetch(`/api/combos/${id}`, { credentials: "include", headers: hubHeaders });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: allCombos = [] } = useQuery<Combo[]>({ queryKey: ["/api/combos"] });
  const { data: allCoupons = [] } = useCoupons();
  const liveCoupons = (allCoupons ?? []).filter((c) => c.isActive);

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const includedProducts = (combo?.includes ?? []).map((inc) => ({
    item: inc,
    product: productMap[inc.productId] as Product | undefined,
  }));

  const productImages = includedProducts
    .map(({ product }) => product?.imageUrl)
    .filter(Boolean) as string[];

  const productCategories = includedProducts
    .map(({ product }) => product?.category ?? "Fish");

  const otherCombos = allCombos.filter((c) => c.id !== id).slice(0, 8);

  // Per-item discount ratio (applied uniformly to each included product)
  const comboDiscountRatio = combo && combo.originalPrice > 0
    ? combo.discountedPrice / combo.originalPrice
    : 1;

  // Weight parsing + combo gross/net weight calculation
  const parseWeightGrams = (str: string | null | undefined): number | null => {
    if (!str) return null;
    const m = str.match(/([\d.]+)\s*(kg|g|gm|gram|grams|kilogram|kilograms)/i);
    if (!m) return null;
    const val = parseFloat(m[1]);
    return m[2].toLowerCase().startsWith("kg") ? val * 1000 : val;
  };
  const fmtGrams = (g: number) => {
    if (g >= 1000) { const kg = g / 1000; return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)} kg`; }
    return `${Math.round(g)} g`;
  };
  const comboGrossGrams = includedProducts.reduce<number | null>((sum, { product }) => {
    const g = parseWeightGrams(product?.grossWeight);
    if (g === null) return sum;
    return (sum ?? 0) + g;
  }, null);
  const comboNetGrams = includedProducts.reduce<number | null>((sum, { product }) => {
    const g = parseWeightGrams(product?.netWeight);
    if (g === null) return sum;
    return (sum ?? 0) + g;
  }, null);
  const comboGrossWeight = comboGrossGrams !== null ? fmtGrams(comboGrossGrams) : null;
  const comboNetWeight = comboNetGrams !== null ? fmtGrams(comboNetGrams) : null;

  // Collect all recipes from the combo's included products
  const allProductRecipes = includedProducts.flatMap(({ product }) => {
    if (!product) return [];
    const dbRecipes = product.recipes ?? [];
    if (dbRecipes.length > 0) {
      return dbRecipes.map((r: any) => ({
        title: r.title ?? r.name,
        description: r.description,
        image: r.image ?? null,
        totalTime: r.totalTime ?? "",
        difficulty: r.difficulty ?? "",
        productName: product.name,
      }));
    }
    // Fall back to dummy recipes for the category
    return getDummyDetail(product.category).recipes.map((r) => ({
      title: r.name,
      description: r.description,
      image: r.image,
      totalTime: r.totalTime,
      difficulty: r.difficulty,
      productName: product.name,
    }));
  });

  // Similar products: same categories as combo items, excluding combo's own products
  // Falls back to all available products if not enough same-category ones exist
  const comboProductIds = new Set((combo?.includes ?? []).map((inc) => inc.productId));
  const comboCategories = new Set(includedProducts.map(({ product }) => product?.category).filter(Boolean));
  const sameCategorySimilar = products.filter(
    (p) => !p.isArchived && !comboProductIds.has(p.id) && comboCategories.has(p.category)
  );
  const similarProducts = sameCategorySimilar.length >= 3
    ? sameCategorySimilar.slice(0, 10)
    : products.filter((p) => !p.isArchived && !comboProductIds.has(p.id)).slice(0, 10);

  const handleAddToCart = () => {
    if (!combo) return;
    for (let i = 0; i < qty; i++) {
      addToCart({
        id: -Math.abs(parseInt(combo.id.slice(-6), 16) || 9999),
        name: combo.name,
        price: combo.discountedPrice,
        category: "Combo",
        status: "available",
        unit: combo.weight ?? undefined,
        imageUrl: null,
        isArchived: false,
        updatedAt: new Date(),
        limitedStockNote: null,
        sectionId: null,
        isCombo: true,
      } as any);
    }
    setAdded(true);
    setTimeout(() => { setAdded(false); setIsCartOpen(true); }, 800);
  };

  if (comboLoading) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <Header
          onSearchSubmit={(q) => navigate(q ? `/?q=${encodeURIComponent(q)}` : "/")}
          collapsibleMobileSearch
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <Skeleton className="aspect-square rounded-3xl" />
            <div className="space-y-4">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
          </div>
        </div>
        <CartDrawer />
      </div>
    );
  }

  if (!combo) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Header
          onSearchSubmit={(q) => navigate(q ? `/?q=${encodeURIComponent(q)}` : "/")}
          collapsibleMobileSearch
        />
        <p className="text-muted-foreground text-lg">Combo not found.</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
        <CartDrawer />
      </div>
    );
  }

  const savings = combo.originalPrice - combo.discountedPrice;

  return (
    <div className="min-h-screen bg-background font-sans">
      <Header
        onSearchSubmit={(q) => navigate(q ? `/?q=${encodeURIComponent(q)}` : "/")}
        collapsibleMobileSearch
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

        {/* Back */}
        <button
          onClick={() => navigate("/" as any)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to store
        </button>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-14">

          {/* LEFT – Hero image collage */}
          <ComboHeroImage
            productImages={productImages}
            productCategories={productCategories}
            name={combo.name}
            tags={combo.tags}
          />

          {/* RIGHT – Details */}
          <div className="flex flex-col gap-5">

            {/* Name + badges */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className="text-xs font-bold tracking-wide rounded-full px-2.5 py-0.5 text-white inline-block"
                  style={{ backgroundColor: "#F05B4E" }}
                >
                  Combo Pack
                </span>
                <span
                  className="text-xs font-bold tracking-wide rounded-full px-2.5 py-0.5 text-white inline-block"
                  style={{ backgroundColor: "#F05B4E" }}
                >
                  {combo.includes.length} Items
                </span>
                {combo.discount > 0 && (
                  <span
                    className="text-xs font-bold tracking-wide rounded-full px-2.5 py-0.5 text-white inline-block"
                    style={{ backgroundColor: "#F05B4E" }}
                  >
                    {combo.discount}% Off
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">{combo.name}</h1>
            </div>

            {/* Description */}
            {combo.fullDescription && (
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">{combo.fullDescription}</p>
            )}

            {/* What's Included */}
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                <span
                  aria-hidden
                  className="w-5 h-5 sm:w-6 sm:h-6 inline-block shrink-0"
                  style={{
                    backgroundColor: "#F05B4E",
                    WebkitMaskImage: `url(${checkedIconImg})`,
                    maskImage: `url(${checkedIconImg})`,
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                  }}
                />
                What's Included
              </h3>
              <div className="divide-y divide-border/30">
                {includedProducts.map(({ item, product }, i) => (
                  <IncludedProductCard
                    key={i}
                    item={item}
                    product={product}
                    comboDiscountRatio={comboDiscountRatio}
                  />
                ))}
              </div>
            </div>

            {/* Price block */}
            <div className="bg-muted/30 border border-border/30 rounded-2xl px-5 py-4">
              <div className="flex items-end gap-3 mb-1">
                <span className="text-3xl font-bold text-foreground">₹{combo.discountedPrice}</span>
                <span className="text-base text-muted-foreground line-through mb-0.5">₹{combo.originalPrice}</span>
                <span className="text-sm font-semibold text-green-600 mb-0.5">{combo.discount}% off</span>
              </div>
              <p className="text-xs text-muted-foreground">Inclusive of all taxes. Free delivery on orders above ₹499.</p>
            </div>

            {/* Savings highlight */}
            {savings > 0 && (
              <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 text-amber-600 fill-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    You save ₹{savings} ({combo.discount}% off)
                  </p>
                  <p className="text-xs text-muted-foreground">vs buying each item separately</p>
                </div>
              </div>
            )}

            {/* Qty + Add to Cart */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 bg-muted/40 border border-border/40 rounded-full px-4 py-2">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="text-xl font-bold text-foreground w-7 h-7 flex items-center justify-center hover:text-primary transition-colors"
                  data-testid="button-qty-decrease"
                >−</button>
                <span className="text-base font-semibold w-5 text-center" data-testid="text-qty">{qty}</span>
                <button
                  onClick={() => setQty(q => q + 1)}
                  className="text-xl font-bold text-foreground w-7 h-7 flex items-center justify-center hover:text-primary transition-colors"
                  data-testid="button-qty-increase"
                >+</button>
              </div>
              <Button
                onClick={handleAddToCart}
                className={`flex-1 h-12 rounded-full font-bold text-base flex items-center justify-center gap-2 transition-all ${
                  added ? "bg-emerald-500 hover:bg-emerald-500 text-white" : "bg-primary text-white shadow-lg shadow-primary/20"
                }`}
                data-testid="button-add-combo-to-cart"
              >
                {added ? (
                  <><Check className="w-5 h-5" /> Added to Cart!</>
                ) : (
                  <><ShoppingBag className="w-5 h-5" /> Add {qty} to Cart — ₹{combo.discountedPrice * qty}</>
                )}
              </Button>
            </div>

            {/* Available Offers — matches single product page */}
            {liveCoupons.length > 0 && (
              <div className="border border-border/40 rounded-2xl overflow-hidden">
                <div
                  className="w-full flex items-center gap-2.5 px-4 py-3 bg-muted/20"
                  data-testid="header-offers"
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
                    <span className="text-sm font-semibold text-foreground">
                      Offers Available
                    </span>
                  </div>
                </div>

                <div className="flex flex-col divide-y divide-border/20 border-t border-border/20">
                  {liveCoupons.map((c) => (
                    <CouponCard key={c.id} code={c.code} desc={c.description} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Recipes from Combo Products ── */}
        {allProductRecipes.length > 0 && (
          <section className="mb-14">
            <div className="flex items-center gap-2 mb-5">
              <ChefHat className="w-5 h-5 text-accent" />
              <h2 className="text-xl font-bold text-foreground">Recipes from This Combo</h2>
            </div>
            <div className="relative">
              <div ref={productRecipesScrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {allProductRecipes.map((recipe, idx) => (
                  <div
                    key={idx}
                    className="min-w-[260px] sm:min-w-[280px] snap-start bg-card border border-border/30 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                  >
                    <div className="w-full h-44 overflow-hidden bg-muted/20 flex items-center justify-center">
                      {recipe.image ? (
                        <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <ChefHat className="w-10 h-10 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="p-4 flex flex-col flex-1 gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">{recipe.productName}</span>
                      <h4 className="font-bold text-sm text-foreground leading-snug line-clamp-2">{recipe.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">{recipe.description}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {recipe.totalTime && <span className="text-xs text-muted-foreground">⏱ {recipe.totalTime}</span>}
                        {recipe.difficulty && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            recipe.difficulty === "Easy" ? "bg-green-100 text-green-700"
                            : recipe.difficulty === "Medium" ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                          }`}>{recipe.difficulty}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <SwipeHint scrollRef={productRecipesScrollRef} />
            </div>
          </section>
        )}

        {/* ── More Combo Deals ── */}
        {otherCombos.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="w-5 h-5 text-accent" />
              <h2 className="text-xl font-bold text-foreground">More Combo Deals</h2>
            </div>
            <div className="relative">
              <div ref={combosScrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {otherCombos.map((c) => (
                  <ComboCard key={c.id} combo={c} productMap={productMap} />
                ))}
              </div>
              <SwipeHint scrollRef={combosScrollRef} />
            </div>
          </section>
        )}
        {/* ── Similar Products ── */}
        {similarProducts.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-5">
              <ShoppingBasket className="w-5 h-5 text-accent" />
              <h2 className="text-xl font-bold text-foreground">You May Also Like</h2>
            </div>
            <div className="relative">
              <div ref={similarScrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {similarProducts.map((p) => (
                  <div key={p.id} className="w-[172px] sm:w-[190px] shrink-0 snap-start">
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
              <SwipeHint scrollRef={similarScrollRef} />
            </div>
          </section>
        )}
      </div>

      <CartDrawer />
    </div>
  );
}
