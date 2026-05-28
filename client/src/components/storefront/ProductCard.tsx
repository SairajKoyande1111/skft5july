import { Plus, Minus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/context/CartContext";
import { useLocation } from "wouter";
import type { Product } from "@shared/schema";
import fishImg from "@assets/Gemini_Generated_Image_w6wqkkw6wqkkw6wq_(1)_1772713077919.png";
import prawnsImg from "@assets/Gemini_Generated_Image_5xy0sd5xy0sd5xy0_1772713090650.png";
import chickenImg from "@assets/Gemini_Generated_Image_g0ecb4g0ecb4g0ec_1772713219972.png";
import muttonImg from "@assets/Gemini_Generated_Image_8fq0338fq0338fq0_1772713565349.png";
import masalaImg from "@assets/Gemini_Generated_Image_4e60a64e60a64e60_1772713888468.png";

const DUMMY_DETAILS: Record<string, { pieces: string; serves: string }> = {
  Fish:    { pieces: "2-3 Pieces", serves: "Serves 3" },
  Prawns:  { pieces: "20-25 Pieces", serves: "Serves 3" },
  Chicken: { pieces: "2-4 Pieces", serves: "Serves 4" },
  Mutton:  { pieces: "6-8 Pieces", serves: "Serves 4" },
  Masalas: { pieces: "1 Pack", serves: "Serves 6" },
};

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, removeFromCart, updateQuantity, items, computeMaxQty } = useCart();
  const [, setLocation] = useLocation();
  const isUnavailable = product.status === "unavailable";

  const cartItem = items.find(i => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;

  const getFallbackImage = (category: string) => {
    switch (category) {
      case "Prawns": return prawnsImg;
      case "Chicken": return chickenImg;
      case "Mutton": return muttonImg;
      case "Masalas": return masalaImg;
      default: return fishImg;
    }
  };

  const details = DUMMY_DETAILS[product.category] ?? DUMMY_DETAILS["Fish"];
  const hasDiscount = product.originalPrice != null && product.price != null && product.originalPrice > product.price;
  const discountPct = hasDiscount ? Math.round((product.originalPrice! - product.price!) / product.originalPrice! * 100) : null;
  const strikePrice = hasDiscount ? product.originalPrice : null;

  const maxQty = cartItem ? computeMaxQty(cartItem) : 999;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product);
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product);
  };

  const handleDecrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (qty <= 1) {
      removeFromCart(product.id);
    } else {
      updateQuantity(product.id, qty - 1);
    }
  };

  return (
    <div
      className="group relative bg-card flex flex-col h-full transition-all duration-300 cursor-pointer"
      onClick={() => setLocation(`/product/${product.id}`)}
    >
      <div className="relative aspect-square w-full bg-muted/30 overflow-hidden mb-3 border border-border/20 rounded-xl">
        <img
          src={product.imageUrl || getFallbackImage(product.category)}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover transition-transform duration-700 ${
            isUnavailable ? "grayscale opacity-60" : "group-hover:scale-110"
          }`}
        />

        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.status === "limited" && (
            <Badge variant="outline" className="bg-amber-500/90 backdrop-blur text-white border-none shadow-sm py-0.5 text-[10px] h-5">
              Limited
            </Badge>
          )}
          {product.status === "unavailable" && (
            <Badge variant="outline" className="bg-red-500/90 backdrop-blur text-white border-none shadow-sm py-0.5 text-[10px] h-5">
              Sold Out
            </Badge>
          )}
        </div>

        {product.status === "limited" && product.limitedStockNote && (
          <div className="absolute bottom-2 left-2 right-2">
            <div className="bg-black/60 backdrop-blur rounded px-2 py-1 text-[10px] font-medium text-white shadow-sm flex items-center gap-1">
              <Info className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{product.limitedStockNote}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col px-1">
        <h3 className="font-sans font-medium text-base sm:text-lg text-foreground leading-snug mb-1.5 line-clamp-2">
          {product.name}
        </h3>

        <p className="text-sm text-muted-foreground mb-2.5 font-normal">
          {product.grossWeight && (
            <>
              <span className="font-medium text-foreground/80">{product.grossWeight}</span>
              <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>
            </>
          )}
          {details.pieces}&nbsp;&nbsp;|&nbsp;&nbsp;{details.serves}
        </p>

        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg sm:text-xl font-semibold text-foreground">₹{product.price}</span>
            {strikePrice && <span className="text-sm text-muted-foreground line-through">₹{strikePrice}</span>}
            {discountPct && <span className="text-sm font-semibold text-green-600">{discountPct}% off</span>}
          </div>

          {isUnavailable ? (
            <Button
              disabled
              className="rounded-full w-9 h-9 p-0 text-white shadow-md flex items-center justify-center shrink-0 bg-muted"
              size="icon"
            >
              <span className="text-[10px]">Out</span>
            </Button>
          ) : qty === 0 ? (
            <Button
              onClick={handleAdd}
              data-testid={`button-add-product-${product.id}`}
              className="rounded-full w-9 h-9 p-0 text-white shadow-md flex items-center justify-center shrink-0 bg-primary hover:bg-[#F05B4E] transition-colors"
              size="icon"
            >
              <Plus className="w-5 h-5 text-white" />
            </Button>
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-0 rounded-full bg-primary shadow-md overflow-hidden shrink-0"
              data-testid={`stepper-product-${product.id}`}
            >
              <button
                onClick={handleDecrease}
                data-testid={`button-decrease-product-${product.id}`}
                className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-white font-semibold text-xs min-w-[24px] text-center select-none">
                {qty}
              </span>
              <button
                onClick={handleIncrease}
                disabled={qty >= maxQty}
                data-testid={`button-increase-product-${product.id}`}
                className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 transition-colors disabled:opacity-40"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
