import { useRoute, useLocation } from "wouter";
import { useProducts } from "@/hooks/use-products";
import { useProductCoupons } from "@/hooks/use-coupons";
import { useCart } from "@/context/CartContext";
import { Header } from "@/components/storefront/Header";
import { CartDrawer } from "@/components/storefront/CartDrawer";
import { ProductCard } from "@/components/storefront/ProductCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getDummyDetail } from "@/lib/productDummyData";
import {
  ChevronLeft, Plus, Minus, Copy, Check, ChefHat, ShoppingBasket,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { useState, useRef } from "react";
import { SwipeHint } from "@/components/storefront/SwipeHint";
import type { Product } from "@shared/schema";

import weighScaleIcon from "@assets/weight-scale_1774801344716.png";
import piecesIcon from "@assets/cutlery_1774801395283.png";
import servesIcon from "@assets/hot-food_1774801420499.png";
import iconTimeImg from "@assets/time_1776949603776.png";
import giftCardIconImg from "@/assets/gift-card.png";
import tagIconImg from "@/assets/tag.png";
import Lottie from "lottie-react";
import recipesIconAnim from "@/assets/lottie/recipes-icon.json";
import mayAlsoLikeAnim from "@/assets/lottie/may-also-like.json";

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

function CouponCard({ code, description }: { code: string; description: string; color?: string }) {
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
          <p className="text-xs text-muted-foreground mt-1 whitespace-normal break-words leading-snug">{description}</p>
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

function RecipeCard({
  recipe, category, index, onViewRecipe,
}: {
  recipe: { name: string; description: string; image: string; totalTime: string; difficulty: string };
  category: string;
  index: number;
  onViewRecipe: (category: string, index: number) => void;
}) {
  return (
    <div className="min-w-[260px] sm:min-w-[280px] snap-start bg-card border border-border/30 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      <div className="w-full h-44 overflow-hidden bg-muted/20">
        <img
          src={recipe.image}
          alt={recipe.name}
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
        />
      </div>
      <div className="p-4 flex flex-col flex-1 gap-2">
        <h4 className="font-medium text-base text-foreground leading-snug line-clamp-2">{recipe.name}</h4>
        <p className="text-xs font-light text-muted-foreground leading-relaxed line-clamp-3 flex-1">{recipe.description}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="w-3.5 h-3.5 inline-block shrink-0"
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
            {recipe.totalTime}
          </span>
          {recipe.difficulty && (
            <span className="px-2 py-0.5 rounded-full font-medium text-[11px] bg-[#364F9F] text-white">{recipe.difficulty}</span>
          )}
        </div>
        <button
          onClick={() => onViewRecipe(category, index)}
          className="mt-1 w-full text-sm font-semibold bg-accent text-white border border-accent rounded-full px-3 py-2 hover:bg-[#364F9F] hover:border-[#364F9F] hover:text-white transition-colors"
        >
          View Recipe
        </button>
      </div>
    </div>
  );
}

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const [, setLocation] = useLocation();
  const { data: products, isLoading } = useProducts();
  const { addToCart } = useCart();
  const [qty, setQty] = useState(1);
  const recipeScrollRef = useRef<HTMLDivElement>(null);
  const similarScrollRef = useRef<HTMLDivElement>(null);

  const productId = params?.id;
  const product = products?.find((p) => p.id === productId);
  const isUnavailable = product?.status === "unavailable";
  const [offersExpanded, setOffersExpanded] = useState(false);

  const { coupons: liveCoupons } = useProductCoupons(productId, product?.couponIds ?? []);

  const dummy = product ? getDummyDetail(product.category) : null;
  const hasDiscount = product?.originalPrice != null && product?.price != null && product.originalPrice > product.price;
  const effectiveDiscountPct = hasDiscount
    ? Math.round((product!.originalPrice! - product!.price!) / product!.originalPrice! * 100)
    : 0;
  const strikePrice = hasDiscount ? product!.originalPrice : null;

  const availableProducts = products?.filter((p) => !p.isArchived && p.id !== productId) ?? [];
  const sameCategory = availableProducts.filter((p) => p.category === product?.category);
  const otherCategory = availableProducts.filter((p) => p.category !== product?.category);
  const recommended = [...sameCategory, ...otherCategory].slice(0, 10);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header
          onSearchSubmit={(q) => setLocation(q ? `/?q=${encodeURIComponent(q)}` : "/")}
          collapsibleMobileSearch
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
          <Skeleton className="aspect-square rounded-3xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
        <CartDrawer />
      </div>
    );
  }

  if (!product || !dummy) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Header
          onSearchSubmit={(q) => setLocation(q ? `/?q=${encodeURIComponent(q)}` : "/")}
          collapsibleMobileSearch
        />
        <p className="text-muted-foreground text-lg">Product not found.</p>
        <Button onClick={() => setLocation("/")}>Go Home</Button>
        <CartDrawer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      <Header
        onSearchSubmit={(q) => setLocation(q ? `/?q=${encodeURIComponent(q)}` : "/")}
        collapsibleMobileSearch
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

        {/* Back */}
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to store
        </button>

        {/* ── Main Grid: Image | Details ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-14">

          {/* LEFT – Image */}
          <div className="relative">
            <div className="aspect-square rounded-3xl overflow-hidden border border-border/20 shadow-lg bg-muted/20">
              <img
                src={product.imageUrl || getFallbackImage(product.category)}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            {product.status === "limited" && (
              <Badge className="absolute top-4 left-4 bg-amber-500 text-white border-none shadow">Limited Stock</Badge>
            )}
            {product.status === "unavailable" && (
              <Badge className="absolute top-4 left-4 bg-red-500 text-white border-none shadow">Sold Out</Badge>
            )}
          </div>

          {/* RIGHT – Details */}
          <div className="flex flex-col gap-5">

            {/* Name + category / subcategory */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className="text-xs font-bold tracking-wide rounded-full px-2.5 py-0.5 text-white inline-block"
                  style={{ backgroundColor: "#F05B4E" }}
                  data-testid={`badge-category-${product.category}`}
                >
                  {product.category}
                </span>
                {product.subCategory && product.subCategory !== product.name && (
                  <span
                    className="text-xs font-semibold tracking-wide rounded-full px-2.5 py-0.5 inline-block border"
                    style={{ borderColor: "#364F9F", color: "#364F9F", backgroundColor: "transparent" }}
                  >
                    {product.subCategory}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">{product.name}</h1>
            </div>

            {/* Description */}
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">{product.description || dummy.description}</p>

            {/* Pieces / Serves / Weight — single row; weight stacks gross/net on mobile, inline on desktop */}
            <div className="flex items-center justify-between sm:justify-start gap-x-3 sm:gap-x-5 py-1 text-black dark:text-white whitespace-nowrap">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <span
                  aria-hidden
                  className="w-6 h-6 sm:w-7 sm:h-7 inline-block shrink-0 bg-black dark:bg-white"
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
                <span className="text-sm sm:text-lg font-semibold leading-tight">
                  {product.pieces || dummy.pieces}
                </span>
              </div>

              <span aria-hidden className="block w-px h-6 sm:h-7 bg-black/70 dark:bg-white/70 shrink-0" />

              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <span
                  aria-hidden
                  className="w-6 h-6 sm:w-7 sm:h-7 inline-block shrink-0 bg-black dark:bg-white"
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
                <span className="text-sm sm:text-lg font-semibold leading-tight">
                  {product.serves || dummy.serves}
                </span>
              </div>

              {(product.grossWeight || product.netWeight) && (
                <span aria-hidden className="block w-px h-6 sm:h-7 bg-black/70 dark:bg-white/70 shrink-0" />
              )}

              {(product.grossWeight || product.netWeight) && (
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                  <span
                    aria-hidden
                    className="w-6 h-6 sm:w-7 sm:h-7 inline-block shrink-0 bg-black dark:bg-white"
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
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1 leading-tight text-sm sm:text-lg font-semibold">
                    {product.grossWeight && (
                      <span>
                        {product.grossWeight}
                        <span className="font-normal ml-0.5">gross</span>
                      </span>
                    )}
                    {product.grossWeight && product.netWeight && (
                      <span className="hidden sm:inline font-normal opacity-50">/</span>
                    )}
                    {product.netWeight && (
                      <span>
                        {product.netWeight}
                        <span className="font-normal ml-0.5">net</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Price */}
            <div className="bg-muted/30 border border-border/30 rounded-2xl px-5 py-4">
              <div className="flex items-end gap-3 mb-1">
                <span className="text-3xl font-bold text-foreground">₹{product.price}</span>
                {strikePrice && <span className="text-base text-muted-foreground line-through mb-0.5">₹{strikePrice}</span>}
                {effectiveDiscountPct > 0 && <span className="text-sm font-semibold text-green-600 mb-0.5">{effectiveDiscountPct}% off</span>}
              </div>
              <p className="text-xs text-muted-foreground">Inclusive of all taxes. Free delivery on orders above ₹499.</p>
            </div>

            {/* Qty + Add to Cart */}
            <div className="flex items-center gap-4">
              <div className="flex items-center border border-border/40 rounded-full overflow-hidden">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center font-semibold text-sm">{qty}</span>
                <button
                  onClick={() => setQty(q => q + 1)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <Button
                onClick={() => { for (let i = 0; i < qty; i++) addToCart(product, 1, true); }}
                disabled={isUnavailable}
                className="flex-1 h-11 rounded-full bg-primary hover:bg-primary/90 text-white font-semibold text-sm shadow-md"
              >
                {isUnavailable ? "Out of Stock" : `Add ${qty} to Cart — ₹${(product.price ?? 0) * qty}`}
              </Button>
            </div>

            {/* Available Offers — collapsible (matches Order Summary styling) */}
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
                    <CouponCard key={c.id} code={c.code} description={c.description} color={c.color} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Explore New Recipes ── */}
        <section className="mb-14">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0">
              <Lottie animationData={recipesIconAnim} loop autoplay />
            </div>
            <h2 className="text-lg sm:text-xl font-medium text-foreground">Explore New Recipes</h2>
          </div>
          {product.recipes && product.recipes.length > 0 ? (
            <div className="relative">
              <div ref={recipeScrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {product.recipes.map((r, idx) => (
                  <div
                    key={idx}
                    className="min-w-[260px] sm:min-w-[280px] snap-start bg-card border border-border/30 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                  >
                    <div className="w-full h-44 overflow-hidden bg-muted/20 flex items-center justify-center">
                      {r.image ? (
                        <img src={r.image} alt={r.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
                          <ChefHat className="w-10 h-10" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex flex-col flex-1 gap-2">
                      <h4 className="font-medium text-base text-foreground leading-snug line-clamp-2">{r.title}</h4>
                      <p className="text-xs font-light text-muted-foreground leading-relaxed line-clamp-3 flex-1">{r.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {r.totalTime && (
                          <span className="inline-flex items-center gap-1">
                            <span
                              aria-hidden
                              className="w-3.5 h-3.5 inline-block shrink-0"
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
                            {r.totalTime}
                          </span>
                        )}
                        {r.difficulty && (
                          <span className="px-2 py-0.5 rounded-full font-medium text-[11px] bg-[#364F9F] text-white">{r.difficulty}</span>
                        )}
                      </div>
                      <button
                        onClick={() => setLocation(`/recipe/product/${product.id}/${idx}`)}
                        className="mt-1 w-full text-sm font-semibold bg-accent text-white border border-accent rounded-full px-3 py-2 hover:bg-[#364F9F] hover:border-[#364F9F] hover:text-white transition-colors"
                      >
                        View Recipe
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <SwipeHint scrollRef={recipeScrollRef} />
            </div>
          ) : (
            <div className="relative">
              <div ref={recipeScrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {dummy.recipes.map((r, idx) => (
                  <RecipeCard
                    key={r.name}
                    recipe={r}
                    category={product.category}
                    index={idx}
                    onViewRecipe={(cat, i) => setLocation(`/recipe/${encodeURIComponent(cat)}/${i}`)}
                  />
                ))}
              </div>
              <SwipeHint scrollRef={recipeScrollRef} />
            </div>
          )}
        </section>

        {/* ── Similar Products ── */}
        {recommended.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0">
                <Lottie animationData={mayAlsoLikeAnim} loop autoplay />
              </div>
              <h2 className="text-lg sm:text-xl font-medium text-foreground">
                {sameCategory.length > 0 ? `More ${product.category}` : "You May Also Like"}
              </h2>
            </div>
            <div className="relative">
              <div
                ref={similarScrollRef}
                className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x"
              >
                {recommended.map((p) => (
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
