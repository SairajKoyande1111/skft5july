import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Lottie from "lottie-react";
import { Header } from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/Footer";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import profileAnim1 from "@/assets/lottie/profile1.json";
import profileAnim2 from "@/assets/lottie/profile2.json";
import logoutAnim from "@/assets/lottie/logout.json";
import logoutPopupAnim from "@/assets/lottie/logout-fish.json";
import searchImg from "@assets/search-interface-symbol_1774706690468.png";
import emptyAddressAnim from "@/assets/lottie/empty-address.json";
import iconHomeImg from "@assets/home_1776927604826.png";
import iconEditImg from "@assets/edit_1776927607777.png";
import iconBinImg from "@assets/bin_1776927610776.png";
import orderIconImg from "@/assets/order-icon.png";
import trackPlacedImg from "@/assets/track-placed.png";
import trackConfirmedImg from "@/assets/track-confirmed.png";
import trackDeliveryImg from "@/assets/track-delivery.png";
import trackDeliveredImg from "@/assets/track-delivered.png";
import invoiceImg from "@/assets/invoice.png";
import iconBriefcaseImg from "@assets/briefcase_1776927648499.png";
import headerUserImg from "@assets/user_(1)_1774707188827.png";
import headerCartImg from "@assets/shopping-bag_1774706595493.png";
import headerLocationImg from "@assets/placeholder_(1)_1774706943633.png";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCustomer } from "@/context/CustomerContext";
import { useHub } from "@/context/HubContext";
import { OtpModal } from "@/components/storefront/OtpModal";
import { apiRequest } from "@/lib/queryClient";
import type { Customer, CustomerAddress, OrderRequest, Product } from "@shared/schema";
import fishImg from "@assets/Gemini_Generated_Image_w6wqkkw6wqkkw6wq_(1)_1772713077919.png";
import prawnsImg from "@assets/Gemini_Generated_Image_5xy0sd5xy0sd5xy0_1772713090650.png";
import chickenImg from "@assets/Gemini_Generated_Image_g0ecb4g0ecb4g0ec_1772713219972.png";
import muttonImg from "@assets/Gemini_Generated_Image_8fq0338fq0338fq0_1772713565349.png";
import masalaImg from "@assets/Gemini_Generated_Image_4e60a64e60a64e60_1772713888468.png";
import {
  User, MapPin, Plus, Pencil, Trash2,
  CheckCircle2, ChevronLeft, Home, Briefcase, Tag, Navigation,
  ShoppingBag, Clock, Truck, PackageCheck, ChevronDown, ChevronUp,
  Receipt, Package, AlertCircle, LogOut, LayoutGrid, List,
  Search, X, ChevronRight, Navigation2
} from "lucide-react";

function getFallbackImage(category: string): string {
  switch (category) {
    case "Prawns": return prawnsImg;
    case "Chicken": return chickenImg;
    case "Mutton": return muttonImg;
    case "Masalas": return masalaImg;
    default: return fishImg;
  }
}

const TYPE_OPTIONS = [
  { value: "house" as const, iconImg: iconHomeImg, label: "House" },
  { value: "office" as const, iconImg: iconBriefcaseImg, label: "Office" },
  { value: "other" as const, iconImg: null, label: "Other" },
];

const addressTypeColors: Record<string, string> = {
  house: "bg-pink-100 text-pink-700",
  office: "bg-purple-100 text-purple-700",
  other: "bg-amber-100 text-amber-700",
};

type EmptyAddress = Omit<CustomerAddress, "id">;
const emptyAddress: EmptyAddress = {
  name: "", phone: "", building: "", street: "", area: "",
  pincode: "", type: "house", label: "Home", instructions: "",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; bgColor?: string }> = {
  pending:          { label: "Order Placed",      color: "text-white border-transparent", icon: null, bgColor: "#F97316" },
  confirmed:        { label: "Confirmed",          color: "text-white border-transparent", icon: null, bgColor: "#364F9F" },
  out_for_delivery: { label: "Out for Delivery",   color: "text-white border-transparent", icon: null, bgColor: "#F97316" },
  delivered:        { label: "Delivered",          color: "text-white border-transparent", icon: null, bgColor: "#22C55E" },
  cancelled:        { label: "Cancelled",          color: "text-white border-transparent", icon: null, bgColor: "#EF4444" },
};

function formatOrderId(mongoId: string): string {
  try {
    const timestampSec = parseInt(String(mongoId).slice(0, 8), 16);
    const d = new Date(timestampSec * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const suffix = String(mongoId).slice(-4).toUpperCase();
    return `FT-${yyyy}${mm}${dd}-${suffix}`;
  } catch {
    return String(mongoId);
  }
}

interface OrderItem {
  productId: string | number;
  quantity: number;
  name: string;
  price: number;
  imageUrl?: string | null;
}

const TABS = ["Profile & Addresses", "My Orders"] as const;
type Tab = typeof TABS[number];
type OrdersSubTab = "current" | "previous";

const ORDERS_PER_PAGE = 5;

function getOrderTotal(order: OrderRequest) {
  const items: OrderItem[] = Array.isArray(order.items) ? order.items as OrderItem[] : [];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deliveryFee = subtotal >= 500 ? 0 : 49;
  const discount = (order as any).coupon?.discountAmount ?? 0;
  return subtotal + deliveryFee - discount;
}

const TRACK_STEPS = [
  { status: "pending",          label: "Order Placed",      desc: "We've received your order",       img: trackPlacedImg },
  { status: "confirmed",        label: "Confirmed",          desc: "Store confirmed your order",       img: trackConfirmedImg },
  { status: "out_for_delivery", label: "Out for Delivery",  desc: "Your order is on the way",         img: trackDeliveryImg },
  { status: "delivered",        label: "Delivered",          desc: "Order delivered successfully",     img: trackDeliveredImg },
];
const BRAND_RED_FILTER = "brightness(0) saturate(100%) invert(45%) sepia(89%) saturate(1620%) hue-rotate(331deg) brightness(99%) contrast(89%)";
const BRAND_BLUE_FILTER = "brightness(0) saturate(100%) invert(28%) sepia(48%) saturate(1517%) hue-rotate(212deg) brightness(91%) contrast(89%)";
const BRAND_ORANGE_FILTER = "brightness(0) saturate(100%) invert(63%) sepia(76%) saturate(1515%) hue-rotate(347deg) brightness(103%) contrast(96%)";
const TRACK_STATUS_ORDER = ["pending", "confirmed", "out_for_delivery", "delivered"];

function TrackOrderModal({ order, onClose }: { order: OrderRequest; onClose: () => void }) {
  const currentIdx = TRACK_STATUS_ORDER.indexOf(order.status);
  const isCancelled = order.status === "cancelled";
  const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  }) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Navigation2 className="w-4 h-4 text-primary" />
                <p className="text-sm font-bold text-foreground">Track Order</p>
              </div>
              <p className="text-xs text-muted-foreground">#{formatOrderId(String(order.id))}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{date}</p>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-muted-foreground hover:bg-slate-200 transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="px-6 py-5">
          {isCancelled ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-red-500" />
              </div>
              <p className="text-sm font-bold text-red-600">Order Cancelled</p>
              <p className="text-xs text-muted-foreground text-center">This order has been cancelled.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {TRACK_STEPS.map((step, idx) => {
                const isDone = idx < currentIdx;
                const isCurrent = idx === currentIdx;
                const isLast = idx === TRACK_STEPS.length - 1;

                return (
                  <div key={step.status} className="flex gap-4">
                    {/* Icon column */}
                    <div className="flex flex-col items-center">
                      <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                        {isCurrent && step.status !== "delivered" ? (
                          <div
                            className="w-7 h-7 animate-pulse"
                            style={{
                              backgroundColor: "#F97316",
                              maskImage: `url(${step.img})`,
                              maskSize: "contain",
                              maskRepeat: "no-repeat",
                              maskPosition: "center",
                              WebkitMaskImage: `url(${step.img})`,
                              WebkitMaskSize: "contain",
                              WebkitMaskRepeat: "no-repeat",
                              WebkitMaskPosition: "center",
                            }}
                          />
                        ) : (
                          <img src={step.img} alt="" className="w-7 h-7 object-contain" style={{ filter: BRAND_BLUE_FILTER }} />
                        )}
                        {isCurrent && step.status !== "delivered" && (
                          <>
                            <span className="absolute inset-0 rounded-full ring-2 ring-orange-400/50" />
                            <span className="absolute inset-0 rounded-full ring-4 ring-orange-400/30 animate-ping" />
                          </>
                        )}
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 flex-1 my-1 min-h-[28px] rounded-full transition-all ${
                          isDone ? "bg-primary" : "bg-slate-200"
                        }`} />
                      )}
                    </div>

                    {/* Content column */}
                    <div className={`pt-2 pb-6 ${isLast ? "pb-2" : ""}`}>
                      <p className={`text-sm font-bold leading-none mb-1 ${
                        isDone ? "text-primary" : isCurrent ? "text-foreground" : "text-slate-300"
                      }`}>
                        {step.label}
                        {isCurrent && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            Current
                          </span>
                        )}
                      </p>
                      <p className={`text-xs ${isDone || isCurrent ? "text-muted-foreground" : "text-slate-300"}`}>{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-0">
          <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Delivering to</p>
              <p className="text-xs font-semibold text-foreground truncate">{order.address}, {order.deliveryArea}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, productImageMap }: { order: OrderRequest; productImageMap: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const items: OrderItem[] = Array.isArray(order.items) ? order.items as OrderItem[] : [];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const deliveryFee = subtotal >= 500 ? 0 : 49;
  const discount = (order as any).coupon?.discountAmount ?? 0;
  const total = subtotal + deliveryFee - discount;
  const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  }) : "";
  const isCancelled = order.status === "cancelled";
  const currentStepIdx = TRACK_STATUS_ORDER.indexOf(order.status);

  return (
    <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden" data-testid={`card-order-${order.id}`}>
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={orderIconImg} alt="" className="w-7 h-7 object-contain flex-shrink-0" style={{ filter: "brightness(0) saturate(100%) invert(28%) sepia(48%) saturate(1517%) hue-rotate(212deg) brightness(91%) contrast(89%)" }} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">Order #{formatOrderId(String(order.id))}</p>
            <p className="text-xs text-muted-foreground">{date}</p>
          </div>
        </div>
        <div
          className={`flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-semibold shrink-0 ${status.color}`}
          style={status.bgColor ? { backgroundColor: status.bgColor } : undefined}
        >
          {status.icon}
          {status.label}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {items.slice(0, expanded ? items.length : 2).map((item, i) => {
          const resolvedImage = item.imageUrl || productImageMap[String(item.productId)] || getFallbackImage('');
          return (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img src={resolvedImage} alt={item.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-sm text-foreground truncate block">{item.name}</span>
                <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
              </div>
            </div>
            <span className="text-sm font-semibold text-foreground shrink-0">₹{((item.price ?? 0) * item.quantity).toLocaleString()}</span>
          </div>
          );
        })}
        {!expanded && items.length > 2 && (
          <p className="text-xs text-muted-foreground">+{items.length - 2} more item{items.length - 2 > 1 ? "s" : ""}</p>
        )}
      </div>

      <div className="px-4 pb-3 flex items-start gap-2">
        <img src={headerLocationImg} alt="" className="w-3.5 h-3.5 object-contain mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">{order.address}, {order.deliveryArea}</p>
      </div>

      {!isCancelled && (
        <div className="px-4 pb-4">
          <div className="flex items-start justify-between gap-1">
            {TRACK_STEPS.map((step, idx) => {
              const isDone = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              const isLast = idx === TRACK_STEPS.length - 1;
              return (
                <div key={step.status} className="flex-1 flex flex-col items-center relative">
                  {!isLast && (
                    <div className={`absolute top-5 left-1/2 w-full h-0.5 ${isDone ? "bg-primary" : "bg-slate-200"}`} />
                  )}
                  <div className="relative z-10 w-10 h-10 flex items-center justify-center">
                    {isCurrent && step.status !== "delivered" ? (
                      <div
                        className="w-7 h-7 animate-pulse"
                        style={{
                          backgroundColor: "#F97316",
                          maskImage: `url(${step.img})`,
                          maskSize: "contain",
                          maskRepeat: "no-repeat",
                          maskPosition: "center",
                          WebkitMaskImage: `url(${step.img})`,
                          WebkitMaskSize: "contain",
                          WebkitMaskRepeat: "no-repeat",
                          WebkitMaskPosition: "center",
                        }}
                      />
                    ) : (
                      <img src={step.img} alt="" className="w-7 h-7 object-contain" style={{ filter: BRAND_BLUE_FILTER }} />
                    )}
                    {isCurrent && step.status !== "delivered" && (
                      <>
                        <span className="absolute inset-0 rounded-full ring-2 ring-orange-400/50" />
                        <span className="absolute inset-0 rounded-full ring-4 ring-orange-400/30 animate-ping" />
                      </>
                    )}
                  </div>
                  <p className={`mt-1.5 text-[10px] font-medium text-center leading-tight ${
                    isCurrent ? "text-foreground font-semibold" : "text-primary"
                  }`}>{step.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {isCancelled && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs font-semibold text-red-600">This order was cancelled</p>
          </div>
        </div>
      )}

      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-base font-bold text-foreground">₹{total.toLocaleString()}</span>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          data-testid={`button-invoice-${order.id}`}
        >
          <img src={invoiceImg} alt="" className="w-3.5 h-3.5 object-contain" style={{ filter: BRAND_RED_FILTER }} />
          {expanded ? "Hide Invoice" : "View Invoice"}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100">
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-bold text-foreground uppercase tracking-widest">Tax Invoice</p>
                <p className="text-[11px] text-muted-foreground">FishTokri · Mumbai</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-foreground">#{formatOrderId(String(order.id))}</p>
                <p className="text-[11px] text-muted-foreground">{date}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 space-y-0.5">
              <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wide">Bill To</p>
              <p className="text-sm font-semibold text-foreground">{order.customerName}</p>
              <p className="text-xs text-muted-foreground">{order.phone}</p>
              <p className="text-xs text-muted-foreground">{order.address}, {order.deliveryArea}</p>
            </div>

            <div>
              <div className="flex text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pb-1.5 border-b border-slate-100">
                <span className="flex-1">Item</span>
                <span className="w-10 text-center">Qty</span>
                <span className="w-20 text-right">Rate</span>
                <span className="w-20 text-right">Amount</span>
              </div>
              <div className="space-y-0">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center py-2 border-b border-slate-50 text-sm">
                    <span className="flex-1 text-foreground">{item.name}</span>
                    <span className="w-10 text-center text-muted-foreground">{item.quantity}</span>
                    <span className="w-20 text-right text-muted-foreground">₹{item.price.toLocaleString()}</span>
                    <span className="w-20 text-right font-semibold text-foreground">₹{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span><span>₹{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Delivery Fee</span>
                <span>{deliveryFee === 0 ? <span className="text-green-600">FREE</span> : `₹${deliveryFee}`}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Coupon Discount ({(order as any).coupon?.code})</span>
                  <span>-₹{discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>GST (5%)</span><span>Included</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-foreground pt-2 border-t border-slate-200">
                <span>Total</span><span>₹{total.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-semibold text-foreground">
                  {(order as any).paymentMethod === "upi" ? "UPI" : "Cash on Delivery"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Payment Status</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(order as any).paymentMethod === "upi" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                  {(order as any).paymentMethod === "upi" ? "Paid" : "Unpaid"}
                </span>
              </div>
            </div>

            {order.notes && (
              <div className="rounded-lg p-2.5" style={{ backgroundColor: "#364F9F" }}>
                <p className="text-[11px] font-semibold text-white mb-0.5">Order Notes</p>
                <p className="text-xs text-white/90">{order.notes}</p>
              </div>
            )}
            <p className="text-[11px] text-center text-muted-foreground pt-1">Thank you for shopping with FishTokri!</p>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderGridCard({ order, productImageMap }: { order: OrderRequest; productImageMap: Record<string, string> }) {
  const items: OrderItem[] = Array.isArray(order.items) ? order.items as OrderItem[] : [];
  const total = getOrderTotal(order);
  const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  }) : "";
  const time = order.createdAt ? new Date(order.createdAt).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit"
  }) : "";

  return (
    <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col" data-testid={`card-grid-order-${order.id}`}>
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Package className="w-3.5 h-3.5 text-primary" />
        </div>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${status.color}`}
          style={status.bgColor ? { backgroundColor: status.bgColor } : undefined}
        >
          {status.label}
        </div>
      </div>

      <div className="px-3 pb-2 flex-1 space-y-1">
        <p className="text-[11px] font-bold text-foreground truncate">#{formatOrderId(String(order.id))}</p>
        <p className="text-[10px] text-muted-foreground">{date} · {time}</p>
        <div className="pt-1 space-y-1.5">
          {items.slice(0, 2).map((item, i) => {
            const resolvedImage = item.imageUrl || productImageMap[String(item.productId)] || getFallbackImage('');
            return (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                <img src={resolvedImage} alt={item.name} className="w-full h-full object-cover" />
              </div>
              <p className="text-xs text-foreground truncate">
                <span className="text-muted-foreground">{item.quantity}×</span> {item.name}
              </p>
            </div>
            );
          })}
          {items.length > 2 && (
            <p className="text-[10px] text-muted-foreground">+{items.length - 2} more</p>
          )}
        </div>
      </div>

      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs font-bold text-foreground">₹{total.toLocaleString()}</span>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span className="truncate max-w-[70px]">{order.deliveryArea}</span>
        </div>
      </div>
    </div>
  );
}

interface OrderFilters {
  search: string;
  status: string;
}

type OrderSort = "newest" | "oldest" | "highest" | "lowest";

const emptyFilters: OrderFilters = { search: "", status: "" };

const STATUS_PILLS = [
  { value: "", label: "All" },
  { value: "pending", label: "Placed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "out_for_delivery", label: "On the way" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const SORT_OPTIONS: { value: OrderSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest", label: "Highest amount" },
  { value: "lowest", label: "Lowest amount" },
];

function applyFilters(orders: OrderRequest[], filters: OrderFilters): OrderRequest[] {
  return orders.filter(order => {
    const items: OrderItem[] = Array.isArray(order.items) ? order.items as OrderItem[] : [];
    if (filters.status && order.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchId = String(order.id).toLowerCase().includes(q);
      const matchItem = items.some(i => i.name.toLowerCase().includes(q));
      if (!matchId && !matchItem) return false;
    }
    return true;
  });
}

function applySorting(orders: OrderRequest[], sort: OrderSort): OrderRequest[] {
  return [...orders].sort((a, b) => {
    if (sort === "newest" || sort === "oldest") {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sort === "newest" ? db - da : da - db;
    }
    const ta = getOrderTotal(a);
    const tb = getOrderTotal(b);
    return sort === "highest" ? tb - ta : ta - tb;
  });
}

export default function Profile() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { customer, isLoading: customerLoading, refetch, logout } = useCustomer();
  const { selectedSubHub } = useHub();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("Profile & Addresses");
  const [ordersSubTab, setOrdersSubTab] = useState<OrdersSubTab>("current");
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState({ name: "", email: "", dateOfBirth: "" });

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [addressForm, setAddressForm] = useState<EmptyAddress>(emptyAddress);
  const [useAccountDetails, setUseAccountDetails] = useState(false);

  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [filters, setFilters] = useState<OrderFilters>(emptyFilters);
  const [sort, setSort] = useState<OrderSort>("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const hasActiveFilters = filters.search !== "" || filters.status !== "";

  const updateFilter = (key: keyof OrderFilters, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setCurrentPage(1);
  };

  useEffect(() => {
    if (customer) {
      setDraftProfile({
        name: customer.name || "",
        email: customer.email || "",
        dateOfBirth: customer.dateOfBirth || "",
      });
    }
  }, [customer]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ordersSubTab]);

  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderRequest[]>({
    queryKey: ["/api/customer/me/orders"],
    queryFn: async () => {
      const res = await fetch("/api/customer/me/orders", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customer && activeTab === "My Orders",
    refetchOnMount: true,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedSubHub?.dbName],
    enabled: !!customer && activeTab === "My Orders" && !!selectedSubHub,
    staleTime: 60 * 1000,
  });

  const productImageMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const p of products) map[p.id] = p.imageUrl || getFallbackImage(p.category || '');
    return map;
  }, [products]);

  const currentOrders = useMemo(() => orders.filter(o => ["pending", "confirmed", "out_for_delivery"].includes(o.status)), [orders]);
  const previousOrders = useMemo(() => orders.filter(o => ["delivered", "cancelled"].includes(o.status)), [orders]);

  const activeOrders = ordersSubTab === "current" ? currentOrders : previousOrders;
  const filteredOrders = useMemo(() => applySorting(applyFilters(activeOrders, filters), sort), [activeOrders, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * ORDERS_PER_PAGE, currentPage * ORDERS_PER_PAGE);

  const updateProfileMutation = useMutation({
    mutationFn: (data: { name?: string | null; email?: string | null; dateOfBirth?: string | null }) =>
      apiRequest("PATCH", "/api/customer/me", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      setEditingProfile(false);
      toast({ title: "Profile updated" });
    },
    onError: () => toast({ title: "Failed to update profile", variant: "destructive" }),
  });

  const addAddressMutation = useMutation({
    mutationFn: (data: EmptyAddress) => apiRequest("POST", "/api/customer/me/addresses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      cancelForm();
      toast({ title: "Address added" });
    },
    onError: () => toast({ title: "Failed to add address", variant: "destructive" }),
  });

  const updateAddressMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EmptyAddress> }) =>
      apiRequest("PATCH", `/api/customer/me/addresses/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      cancelForm();
      toast({ title: "Address updated" });
    },
    onError: () => toast({ title: "Failed to update address", variant: "destructive" }),
  });

  const deleteAddressMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/customer/me/addresses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      toast({ title: "Address removed" });
    },
    onError: () => toast({ title: "Failed to remove address", variant: "destructive" }),
  });

  const openAddForm = () => {
    setEditingAddress(null);
    const isFirstAddress = (customer?.addresses?.length || 0) === 0;
    setAddressForm({
      ...emptyAddress,
      name: isFirstAddress ? (customer?.name || "") : "",
      phone: isFirstAddress ? (customer?.phone || "") : "",
    });
    setUseAccountDetails(false);
    setShowAddressForm(true);
  };

  const openEditForm = (addr: CustomerAddress) => {
    setEditingAddress(addr);
    setAddressForm({
      name: addr.name, phone: addr.phone, building: addr.building,
      street: addr.street, area: addr.area, pincode: addr.pincode || "",
      type: addr.type, label: addr.label, instructions: addr.instructions,
    });
    setUseAccountDetails(false);
    setShowAddressForm(true);
  };

  const cancelForm = () => {
    setShowAddressForm(false);
    setEditingAddress(null);
    setAddressForm(emptyAddress);
    setUseAccountDetails(false);
  };

  const handleUseAccountDetails = (v: boolean) => {
    setUseAccountDetails(v);
    if (v) setAddressForm(f => ({
      ...f,
      name: customer?.name || "",
      phone: customer?.phone || "",
    }));
  };

  const saveAddress = () => {
    if (!addressForm.name || !addressForm.phone || !addressForm.building || !addressForm.area) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(addressForm.phone.trim())) {
      toast({ title: "Enter a valid 10-digit mobile number", variant: "destructive" });
      return;
    }
    const label = addressForm.type === "other"
      ? (addressForm.label || "Other")
      : addressForm.type === "house" ? "Home" : "Office";
    const entry = { ...addressForm, label };
    if (editingAddress) {
      updateAddressMutation.mutate({ id: editingAddress.id, data: entry });
    } else {
      addAddressMutation.mutate(entry);
    }
  };

  if (customerLoading) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        <Header />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          <Skeleton className="h-10 w-48 rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </main>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        <Header />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-10 h-10 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Sign in to continue</h1>
            <p className="text-muted-foreground text-sm">Login with your mobile number to view your profile and orders.</p>
          </div>
          <Button
            onClick={() => setOtpModalOpen(true)}
            className="rounded-xl bg-primary text-white px-8 font-semibold"
            data-testid="button-login"
          >
            Login / Sign up
          </Button>
        </main>
        <OtpModal open={otpModalOpen} onClose={() => setOtpModalOpen(false)} />
      </div>
    );
  }

  const addresses = customer.addresses || [];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Back + Title (left) with Lottie animations (right) */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="rounded-full border border-border/50 bg-white shrink-0"
              data-testid="button-profile-back"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl font-medium text-foreground tracking-tight truncate">My Profile</h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Lottie
              animationData={profileAnim1}
              loop
              className="w-12 h-12 sm:w-14 sm:h-14 shrink-0"
            />
            <Lottie
              animationData={profileAnim2}
              loop
              className="w-12 h-12 sm:w-14 sm:h-14 shrink-0"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 rounded-full p-1 border-2 border-black">
          {TABS.map(tab => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={isActive ? { backgroundColor: "#F05B4E" } : {}}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition-all ${isActive ? "text-white shadow-sm" : "text-slate-700 hover:text-black"}`}
                data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {tab === "Profile & Addresses" && (
                  <img src={headerUserImg} alt="" className="w-4 h-4 object-contain" style={{ filter: isActive ? "brightness(0) invert(1)" : "brightness(0)" }} />
                )}
                {tab === "My Orders" && (
                  <img src={headerCartImg} alt="" className="w-4 h-4 object-contain" style={{ filter: isActive ? "brightness(0) invert(1)" : "brightness(0)" }} />
                )}
                {tab}
              </button>
            );
          })}
        </div>

        {/* ── Profile & Addresses Tab ── */}
        {activeTab === "Profile & Addresses" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <img src={headerUserImg} alt="" className="w-5 h-5 object-contain" />
                  <h2 className="text-base font-medium text-foreground">Profile Details</h2>
                </div>
                {!editingProfile && (
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => {
                      setDraftProfile({ name: customer.name || "", email: customer.email || "", dateOfBirth: customer.dateOfBirth || "" });
                      setEditingProfile(true);
                    }}
                    className="w-7 h-7 rounded-full hover:bg-slate-100"
                    data-testid="button-edit-profile"
                  >
                    <img src={iconEditImg} alt="Edit" className="w-4 h-4 object-contain" style={{ filter: "brightness(0)" }} />
                  </Button>
                )}
              </div>

              {editingProfile ? (
                <div className="space-y-5">
                  {([
                    { field: "name" as const, label: "Full Name", placeholder: "Your name", type: "text" },
                    { field: "email" as const, label: "Email", placeholder: "you@example.com", type: "email" },
                  ] as const).map(({ field, label, placeholder, type }) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <input
                        type={type}
                        value={draftProfile[field]}
                        onChange={e => setDraftProfile(p => ({ ...p, [field]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                        data-testid={`input-profile-${field}`}
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date of Birth</Label>
                    <input
                      type="date"
                      value={draftProfile.dateOfBirth}
                      onChange={e => setDraftProfile(p => ({ ...p, dateOfBirth: e.target.value }))}
                      onClick={(e) => {
                        const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                        if (typeof el.showPicker === "function") el.showPicker();
                      }}
                      className="dob-input w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors cursor-pointer"
                      data-testid="input-profile-dob"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1 rounded-xl text-white hover:opacity-90"
                      style={{ backgroundColor: "#F05B4E" }}
                      onClick={() => setEditingProfile(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 rounded-xl text-white hover:opacity-90"
                      style={{ backgroundColor: "#364F9F" }}
                      disabled={updateProfileMutation.isPending}
                      onClick={() => {
                        if (draftProfile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draftProfile.email.trim())) {
                          toast({ title: "Enter a valid email address", variant: "destructive" });
                          return;
                        }
                        updateProfileMutation.mutate({
                          name: draftProfile.name || null,
                          email: draftProfile.email || null,
                          dateOfBirth: draftProfile.dateOfBirth || null,
                        });
                      }}
                      data-testid="button-save-profile"
                    >
                      {updateProfileMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {[
                    { label: "Phone", value: customer.phone, verified: true },
                    { label: "Name", value: customer.name },
                    { label: "Email", value: customer.email },
                    {
                      label: "Date of Birth",
                      value: customer.dateOfBirth
                        ? new Date(customer.dateOfBirth).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
                        : null,
                    },
                  ].map(({ label, value, verified }) => (
                    <div key={label} className="py-3">
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <div className="flex items-center justify-between gap-2">
                        {value
                          ? <p className="font-medium text-foreground">{value}</p>
                          : <p className="font-normal italic text-muted-foreground text-sm">Not set</p>}
                        {verified && value && (
                          <span className="text-xs font-medium text-emerald-600 shrink-0">Verified</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Addresses section */}
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <img src={headerLocationImg} alt="" className="w-5 h-5 object-contain" />
                  <h2 className="text-base font-medium text-foreground">Saved Addresses</h2>
                </div>
                {!showAddressForm ? (
                  <Button
                    variant="ghost" size="sm"
                    onClick={openAddForm}
                    className="gap-1.5 rounded-xl text-xs hover:opacity-90"
                    style={{ color: "#364F9F" }}
                    data-testid="button-add-address"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Address
                  </Button>
                ) : null}
              </div>

              {showAddressForm && (
                <div className="space-y-3 mb-5 pb-5 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-foreground">{editingAddress ? "Edit Address" : "New Address"}</p>
                    <Button variant="ghost" size="icon" onClick={cancelForm} className="w-7 h-7 rounded-full text-muted-foreground">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Full Name *</Label>
                      <input
                        value={addressForm.name}
                        onChange={e => setAddressForm(f => ({ ...f, name: e.target.value }))}
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
                        value={addressForm.phone}
                        onChange={e => setAddressForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                        placeholder="10-digit mobile"
                        className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                        data-testid="input-address-phone"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Building / Flat No *</Label>
                    <input
                      value={addressForm.building}
                      onChange={e => setAddressForm(f => ({ ...f, building: e.target.value }))}
                      placeholder="Wing A, Flat 302, Building Name"
                      className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                      data-testid="input-address-building"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Street / Locality</Label>
                    <input
                      value={addressForm.street}
                      onChange={e => setAddressForm(f => ({ ...f, street: e.target.value }))}
                      placeholder="Street name or society"
                      className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                      data-testid="input-address-street"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Area / Suburb *</Label>
                      <input
                        value={addressForm.area}
                        onChange={e => setAddressForm(f => ({ ...f, area: e.target.value }))}
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
                        value={addressForm.pincode}
                        onChange={e => setAddressForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
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
                        const selected = addressForm.type === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setAddressForm(f => ({
                              ...f, type: opt.value,
                              label: opt.value === "house" ? "Home" : opt.value === "office" ? "Office" : f.label,
                            }))}
                            style={{ backgroundColor: selected ? "#364F9F" : "#F05B4E", borderColor: selected ? "#364F9F" : "#F05B4E" }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border text-white transition-all hover:opacity-90"
                            data-testid={`button-address-type-${opt.value}`}
                          >
                            {opt.iconImg && (
                              <img src={opt.iconImg} alt="" className="w-3.5 h-3.5 object-contain brightness-0 invert" />
                            )}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {addressForm.type === "other" && (
                      <Input
                        value={addressForm.label}
                        onChange={e => setAddressForm(f => ({ ...f, label: e.target.value }))}
                        placeholder='Custom label (e.g. "Parents Home")'
                        className="rounded-xl border-border/60 text-sm"
                        data-testid="input-address-custom-label"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Delivery Instructions</Label>
                    <input
                      type="text"
                      value={addressForm.instructions}
                      onChange={e => setAddressForm(f => ({ ...f, instructions: e.target.value }))}
                      placeholder="Leave at door, ring bell twice, etc."
                      className="w-full bg-transparent border-0 border-b border-border/60 focus:border-[#364F9F] focus:outline-none px-0 py-1.5 text-sm transition-colors"
                      data-testid="input-address-instructions"
                    />
                  </div>
                  <div className="flex gap-2 pt-3">
                    <Button
                      onClick={cancelForm}
                      className="flex-1 rounded-xl text-white font-medium hover:opacity-90"
                      style={{ backgroundColor: "#F05B4E" }}
                      data-testid="button-cancel-address"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={saveAddress}
                      disabled={addAddressMutation.isPending || updateAddressMutation.isPending}
                      className="flex-1 rounded-xl text-white font-medium hover:opacity-90"
                      style={{ backgroundColor: "#364F9F" }}
                      data-testid="button-save-address"
                    >
                      {(addAddressMutation.isPending || updateAddressMutation.isPending) ? "Saving..." : editingAddress ? "Update Address" : "Save Address"}
                    </Button>
                  </div>
                </div>
              )}

              {addresses.length === 0 && !showAddressForm ? (
                <div className="flex flex-col items-center py-6 gap-2">
                  <Lottie
                    animationData={emptyAddressAnim}
                    loop
                    className="w-28 h-28"
                  />
                  <p className="text-sm text-muted-foreground text-center">No saved addresses yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {addresses.map((addr) => (
                    <div key={addr.id} className="py-3 first:pt-0 last:pb-0" data-testid={`card-address-${addr.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          {(addr.type === "house" || addr.type === "office") && (
                            <div className="mt-0.5 shrink-0">
                              <img
                                src={addr.type === "house" ? iconHomeImg : iconBriefcaseImg}
                                alt=""
                                className="w-4 h-4 object-contain"
                                style={{ filter: "brightness(0)" }}
                              />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-foreground">{addr.name}</p>
                              <Badge className={`text-[10px] font-semibold px-2 py-0 h-4 ${addressTypeColors[addr.type] || "bg-slate-100 text-slate-600"}`}>{addr.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{addr.phone}</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                              {[addr.building, addr.street, addr.area, addr.pincode].filter(Boolean).join(", ")}
                            </p>
                            {addr.instructions && (
                              <p className="text-[11px] text-muted-foreground/70 mt-1 italic">{addr.instructions}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="w-7 h-7 rounded-full hover:bg-slate-100" onClick={() => openEditForm(addr)} data-testid={`button-edit-address-${addr.id}`}>
                            <img src={iconEditImg} alt="Edit" className="w-4 h-4 object-contain" style={{ filter: "brightness(0)" }} />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="w-7 h-7 rounded-full hover:bg-slate-100"
                            disabled={deleteAddressMutation.isPending}
                            onClick={() => deleteAddressMutation.mutate(addr.id)}
                            data-testid={`button-delete-address-${addr.id}`}
                          >
                            <img src={iconBinImg} alt="Delete" className="w-4 h-4 object-contain" style={{ filter: "brightness(0)" }} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Logout button — bottom of Profile & Addresses tab */}
            <button
              onClick={() => setLogoutConfirmOpen(true)}
              style={{ backgroundColor: "#F05B4E" }}
              className="w-full rounded-xl shadow-sm px-5 py-2.5 flex items-center justify-center gap-2 hover:opacity-90 transition-all"
              data-testid="button-logout"
            >
              <Lottie
                animationData={logoutAnim}
                loop
                className="w-6 h-6 shrink-0"
                style={{ filter: "brightness(0) invert(1)" }}
              />
              <span className="text-sm font-medium text-white">Logout</span>
            </button>
          </div>
        )}

        {/* ── My Orders Tab ── */}
        {activeTab === "My Orders" && (
          <div className="space-y-3">
            {/* Active / Previous sub-tabs */}
            <div className="flex rounded-full p-1 border-2 border-black">
              {(["current", "previous"] as OrdersSubTab[]).map(sub => {
                const isActive = ordersSubTab === sub;
                const count = sub === "current" ? currentOrders.length : previousOrders.length;
                return (
                  <button
                    key={sub}
                    onClick={() => setOrdersSubTab(sub)}
                    style={isActive ? { backgroundColor: "#364F9F" } : {}}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition-all ${isActive ? "text-white shadow-sm" : "text-slate-700 hover:text-black"}`}
                    data-testid={`tab-orders-${sub}`}
                  >
                    {sub === "current" ? "Active" : "Previous"}
                    {count > 0 && (
                      <span
                        className="text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center"
                        style={isActive
                          ? { backgroundColor: "white", color: "#364F9F" }
                          : { backgroundColor: "#364F9F", color: "white" }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search bar — same style as home screen */}
            <div className="relative">
              <img src={searchImg} alt="Search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 object-contain z-10" />
              <input
                type="search"
                value={filters.search}
                onChange={e => updateFilter("search", e.target.value)}
                placeholder="Search by order ID or item name…"
                className="w-full pl-10 pr-10 h-10 rounded-full bg-white border border-slate-200 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 text-sm transition-all"
                data-testid="input-filter-search"
              />
              {filters.search && (
                <button
                  onClick={() => updateFilter("search", "")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Orders list */}
            {ordersLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 bg-white rounded-2xl border border-border/50 shadow-sm">
                <ShoppingBag className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {filters.search ? "No orders match your search" : ordersSubTab === "current" ? "No active orders" : "No previous orders"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map(order => <OrderCard key={order.id} order={order} productImageMap={productImageMap} />)}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />

      {/* Logout confirmation dialog */}
      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent className="rounded-3xl max-w-sm">
          <div className="flex justify-center -mt-2 mb-5">
            <Lottie animationData={logoutPopupAnim} loop className="w-28 h-28" />
          </div>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-lg font-medium" style={{ color: "#364F9F" }}>
              Logout from FishTokri?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm">
              You'll need to login again to view your orders, addresses and continue shopping.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:gap-2 sm:justify-center mt-2">
            <AlertDialogCancel
              className="flex-1 mt-0 rounded-xl border-border/60 font-medium"
              data-testid="button-logout-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await logout(); navigate("/"); }}
              className="flex-1 rounded-xl text-white font-medium hover:opacity-90"
              style={{ backgroundColor: "#F05B4E" }}
              data-testid="button-logout-confirm"
            >
              Yes, Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
