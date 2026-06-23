import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import passport from "passport";
import { setupAuth } from "./auth";
import { connectOrdersDb, generateOrderId, getOrderModel } from "./ordersDb";
import { setImage, getImage, deleteImage } from "./imageStore";
import { insertCarouselSlideSchema, insertCategorySchema, insertSectionSchema, insertComboSchema, insertCustomerAddressSchema, updateCustomerSchema, insertInventoryBatchSchema } from "@shared/schema";
import { SuperHubModel, SubHubModel } from "./adminDb";
import { getHubModels } from "./hubConnections";
import { CustomerDbModel } from "./customerDb";
import { computeExpiryDate, computeRemainingTime } from "./inventorySync";
import Razorpay from "razorpay";
import { createHmac } from "crypto";

declare module "express-session" {
  interface SessionData {
    customerPhone?: string;
  }
}

// In-memory OTP store: phone -> { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();
const OTP_TTL_MS = 5 * 60 * 1000;

// ── AiSensy WhatsApp helper ───────────────────────────────────────────────
const AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";
const AISENSY_USERNAME = process.env.AISENSY_USERNAME || "ATHA FOODS PRIVATE LIMITED";

async function sendWhatsApp(campaignName: string, phone: string, templateParams: string[]) {
  const apiKey = process.env.AISENSY_API_KEY;
  if (!apiKey) { console.warn("[WhatsApp] AISENSY_API_KEY not set — skipping"); return; }
  const destination = `91${phone}`;
  try {
    const res = await fetch(AISENSY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        campaignName,
        destination,
        userName: AISENSY_USERNAME,
        templateParams,
        source: "fishtokri-app",
        media: {},
        buttons: [],
        carouselCards: [],
        location: {},
        paramsFallbackValue: { FirstName: templateParams[0] ?? "" },
      }),
    });
    const text = await res.text();
    if (!res.ok) console.error(`[WhatsApp] ${campaignName} failed ${res.status}:`, text);
    else console.log(`[WhatsApp] ${campaignName} → ${destination}`);
  } catch (err) {
    console.error(`[WhatsApp] ${campaignName} error:`, err);
  }
}

// ── Coupon lifecycle helpers ──────────────────────────────────────────────
// These helpers keep activeCoupons and usedCoupons in sync with order lifecycle.

async function addActiveCoupon(
  phone: string,
  couponId: string,
  couponCode: string,
  couponTitle: string,
  subHubId: string,
  orderId: string
) {
  const result = await CustomerDbModel.updateOne(
    { phone, "activeCoupons.couponId": couponId },
    {
      $inc: { "activeCoupons.$.usedCount": 1 },
      $addToSet: { "activeCoupons.$.orderIds": orderId },
    }
  );
  if (result.matchedCount === 0) {
    await CustomerDbModel.updateOne(
      { phone },
      {
        $push: {
          activeCoupons: {
            couponId,
            couponCode,
            couponTitle,
            subHubId,
            usedCount: 1,
            orderIds: [orderId],
            appliedAt: new Date(),
          },
        },
      }
    );
  }
}

async function removeActiveCoupon(phone: string, couponId: string, orderId: string) {
  await CustomerDbModel.updateOne(
    { phone, "activeCoupons.couponId": couponId },
    { $inc: { "activeCoupons.$.usedCount": -1 } }
  );
  await (CustomerDbModel as any).updateOne(
    { phone },
    { $pull: { "activeCoupons.$[elem].orderIds": orderId } },
    { arrayFilters: [{ "elem.couponId": couponId }] }
  );
  await CustomerDbModel.updateOne(
    { phone },
    { $pull: { activeCoupons: { couponId, usedCount: { $lte: 0 } } } }
  );
}

async function addDeliveredCoupon(
  phone: string,
  couponId: string,
  couponCode: string,
  couponTitle: string,
  subHubId: string,
  orderId: string
) {
  await CustomerDbModel.updateOne(
    { phone },
    {
      $push: {
        usedCoupons: {
          couponId,
          couponCode,
          couponTitle,
          orderId,
          subHubId,
          usedAt: new Date(),
        },
      },
    }
  );
}

async function removeDeliveredCoupon(phone: string, couponId: string, orderId: string) {
  await CustomerDbModel.updateOne(
    { phone },
    { $pull: { usedCoupons: { couponId, orderId } } }
  );
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await connectOrdersDb();
  setupAuth(app);

  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };

  // Auth routes
  app.post(api.auth.login.path, passport.authenticate("local"), (req, res) => {
    const user = req.user as any;
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  app.post(api.auth.logout.path, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get(api.auth.me.path, (req, res) => {
    if (req.isAuthenticated()) {
      const user = req.user as any;
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  });

  // ── Hub discovery routes ────────────────────────────────────────────────
  app.get("/api/hubs/super", async (_req, res) => {
    try {
      const hubs = await SuperHubModel.find({ status: "Active" }).lean();
      res.json(hubs.map((h: any) => ({
        id: h._id.toString(),
        name: h.name,
        location: h.location ?? null,
        imageUrl: h.imageUrl ?? null,
      })));
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch super hubs" });
    }
  });

  app.get("/api/hubs/sub", async (req, res) => {
    try {
      const { superHubId } = req.query;
      const filter: any = { status: "Active" };
      if (superHubId) filter.superHubId = superHubId;
      const hubs = await SubHubModel.find(filter).lean();
      res.json(hubs.map((h: any) => ({
        id: h._id.toString(),
        superHubId: h.superHubId?.toString() ?? null,
        name: h.name,
        location: h.location ?? null,
        imageUrl: h.imageUrl ?? null,
        dbName: h.dbName,
        pincodes: (h.pincodes ?? []).map((p: any) =>
          typeof p === "string"
            ? { pincode: p, charge: 0, timeDelay: 0 }
            : { pincode: p.pincode, charge: p.charge ?? 0, timeDelay: p.timeDelay ?? 0 }
        ),
      })));
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch sub hubs" });
    }
  });

  // Helper: get hub models for the dbName in the X-Hub-DB header
  const getReqHubModels = async (req: any) => {
    const dbName = req.headers["x-hub-db"] as string | undefined;
    if (dbName) return getHubModels(dbName);
    return null;
  };

  // ── Inline mappers ──────────────────────────────────────────────────────
  const toProduct = (doc: any) => {
    const allBatches = doc.inventoryBatches ?? [];
    const now = new Date();
    const activeBatches = allBatches.filter((b: any) => {
      if (b.remainingTime === "expired") return false;
      if (b.expiryDate && new Date(b.expiryDate) <= now) return false;
      return true;
    });
    // If product has batches and ALL are expired, mark as unavailable
    const effectiveStatus = allBatches.length > 0 && activeBatches.length === 0
      ? "unavailable"
      : doc.status;
    // Total available quantity — from non-expired batches if they exist, else fall back to doc.quantity
    const availableQty = allBatches.length > 0
      ? activeBatches.reduce((sum: number, b: any) => sum + (b.quantity ?? 0), 0)
      : (doc.quantity != null ? doc.quantity : null);
    return {
      id: doc._id.toString(), name: doc.name, category: doc.category,
      subCategory: doc.subCategory ?? null, status: effectiveStatus,
      limitedStockNote: doc.limitedStockNote ?? null, price: doc.price ?? null,
      originalPrice: doc.originalPrice ?? null, unit: doc.unit ?? null,
      imageUrl: doc.imageUrl ?? null, isArchived: doc.isArchived ?? false,
      updatedAt: doc.updatedAt, sectionId: doc.sectionId ?? null,
      description: doc.description ?? null,
      grossWeight: doc.grossWeight ?? null, netWeight: doc.netWeight ?? null,
      pieces: doc.pieces ?? null, serves: doc.serves ?? null,
      discountPct: doc.discountPct ?? null, quantity: doc.quantity ?? null,
      availableQty,
      couponIds: (doc.couponIds ?? []).map((id: any) => id.toString()),
      recipes: (doc.recipes ?? []).map((r: any) => ({
        title: r.title ?? "", description: r.description ?? "",
        image: r.image ?? "", totalTime: r.totalTime ?? "",
        prepTime: r.prepTime ?? "", cookTime: r.cookTime ?? "",
        servings: r.servings ?? 2, difficulty: r.difficulty ?? "Medium",
        ingredients: (r.ingredients ?? []).map((i: any) => String(i)),
        method: (r.method ?? []).map((m: any) => String(m)),
      })),
    };
  };

  const toCoupon = (doc: any) => ({
    id: doc._id.toString(), code: doc.code, title: doc.title,
    description: doc.description, type: doc.type, discountValue: doc.discountValue,
    minOrderAmount: doc.minOrderAmount ?? 0, maxUsage: doc.maxUsage ?? null,
    isFirstTimeOnly: doc.isFirstTimeOnly ?? false,
    isActive: doc.isActive ?? true, applicableCategories: doc.applicableCategories ?? [],
    expiresAt: doc.expiresAt ?? null, color: doc.color ?? "",
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
  });
  const toSection = (doc: any) => ({
    id: doc._id.toString(), title: doc.title, type: doc.type ?? "products",
    sortOrder: doc.sortOrder ?? 0, isActive: doc.isActive ?? true,
  });
  const toCategory = (doc: any) => ({
    id: doc._id.toString(), name: doc.name, imageUrl: doc.imageUrl ?? null,
    sortOrder: doc.sortOrder ?? 0, isActive: doc.isActive ?? true,
    subCategories: (doc.subCategories ?? []).map((s: any) => ({ name: s.name, imageUrl: s.imageUrl ?? null })),
  });
  const toCarousel = (doc: any) => ({
    id: doc._id.toString(), imageUrl: doc.imageUrl, title: doc.title ?? null,
    linkUrl: doc.linkUrl ?? null, order: doc.order ?? 0, isActive: doc.isActive ?? true,
  });
  const toCombo = (doc: any) => ({
    id: doc._id.toString(), name: doc.name, description: doc.description ?? null,
    fullDescription: doc.fullDescription ?? null, serves: doc.serves ?? null,
    weight: doc.weight ?? null, discountedPrice: doc.discountedPrice,
    originalPrice: doc.originalPrice, discount: doc.discount ?? 0,
    includes: (doc.includes ?? []).map((i: any) => ({ productId: i.productId, label: i.label })),
    tags: doc.tags ?? [], nutrition: (doc.nutrition ?? []).map((n: any) => ({ label: n.label, value: n.value, icon: n.icon ?? "" })),
    isActive: doc.isActive ?? true, sortOrder: doc.sortOrder ?? 0,
  });

  // Products routes
  app.get(api.products.list.path, async (req, res) => {
    const hub = await getReqHubModels(req);
    if (!hub) return res.json([]);
    const docs = await hub.Product.find({
      isArchived: { $ne: true },
      quantity: { $ne: 0 },
    }).lean();
    res.json(docs.map(toProduct));
  });

  app.post(api.products.create.path, requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = api.products.create.input.parse(req.body);
      const doc = await hub.Product.create({ ...input, status: input.status ?? "available", updatedAt: new Date() });
      res.status(201).json(toProduct(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.products.update.path, requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = api.products.update.input.parse(req.body);
      const doc = await hub.Product.findByIdAndUpdate(
        req.params.id,
        { ...input, updatedAt: new Date() },
        { new: true }
      ).lean();
      if (!doc) return res.status(404).json({ message: "Product not found" });
      res.json(toProduct(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.products.bulkUpdateStatus.path, requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const { category, status } = api.products.bulkUpdateStatus.input.parse(req.body);
      await hub.Product.updateMany({ category }, { status, updatedAt: new Date() });
      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.products.delete.path, requireAuth, async (req, res) => {
    const hub = await getReqHubModels(req);
    if (hub) {
      await hub.Product.findByIdAndUpdate(req.params.id, { isArchived: true });
    }
    deleteImage(req.params.id);
    res.status(204).end();
  });

  // Image upload (in-memory)
  app.post("/api/products/:id/image", requireAuth, async (req: any, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      const buffer = Buffer.concat(chunks);
      const mimeType = req.headers["content-type"] || "image/jpeg";
      const id = req.params.id;
      setImage(id, buffer, mimeType);
      const imageUrl = `/api/products/${id}/image`;
      const hub = await getReqHubModels(req);
      if (hub) {
        await hub.Product.findByIdAndUpdate(id, { imageUrl, updatedAt: new Date() });
      }
      res.json({ imageUrl });
    });
    req.on("error", () => res.status(500).json({ message: "Upload failed" }));
  });

  // Image serve (from in-memory)
  app.get("/api/products/:id/image", (req, res) => {
    const img = getImage(req.params.id);
    if (!img) return res.status(404).end();
    res.setHeader("Content-Type", img.mimeType);
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    res.setHeader("ETag", `"${req.params.id}"`);
    if (req.headers["if-none-match"] === `"${req.params.id}"`) {
      return res.status(304).end();
    }
    res.send(img.data);
  });

  // Inventory batch routes
  const toBatch = (b: any) => ({
    id: b._id.toString(),
    quantity: b.quantity,
    shelfLifeDays: b.shelfLifeDays,
    entryDate: b.entryDate,
    expiryDate: b.expiryDate ?? null,
    remainingTime: b.remainingTime ?? null,
  });

  app.get("/api/products/:id/batches", requireAuth, async (req, res) => {
    const hub = await getReqHubModels(req);
    if (!hub) return res.status(400).json({ message: "No hub selected" });
    const doc = await hub.Product.findById(req.params.id).lean() as any;
    if (!doc) return res.status(404).json({ message: "Product not found" });
    const batches = ((doc.inventoryBatches ?? []) as any[])
      .sort((a: any, b: any) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());
    res.json(batches.map(toBatch));
  });

  app.post("/api/products/:id/batches", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertInventoryBatchSchema.parse(req.body);
      const doc = await hub.Product.findById(req.params.id).lean() as any;
      if (!doc) return res.status(404).json({ message: "Product not found" });
      const entryDate = new Date();
      const expiryDate = computeExpiryDate(entryDate, input.shelfLifeDays);
      const remainingTime = computeRemainingTime(expiryDate);
      const newBatch = { quantity: input.quantity, shelfLifeDays: input.shelfLifeDays, entryDate, expiryDate, remainingTime };
      const updatedDoc = await hub.Product.findByIdAndUpdate(
        req.params.id,
        {
          $push: { inventoryBatches: newBatch },
          $inc: { quantity: input.quantity },
          updatedAt: new Date(),
        },
        { new: true }
      ).lean() as any;
      const addedBatch = updatedDoc.inventoryBatches[updatedDoc.inventoryBatches.length - 1];
      res.status(201).json(toBatch(addedBatch));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/products/:id/batches/:batchId", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const doc = await hub.Product.findById(req.params.id).lean() as any;
      if (!doc) return res.status(404).json({ message: "Product not found" });
      const batch = (doc.inventoryBatches ?? []).find((b: any) => b._id.toString() === req.params.batchId) as any;
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      await hub.Product.findByIdAndUpdate(
        req.params.id,
        {
          $pull: { inventoryBatches: { _id: batch._id } },
          $inc: { quantity: -batch.quantity },
          updatedAt: new Date(),
        }
      );
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Razorpay Payment Routes ──────────────────────────────────────────────
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  app.post("/api/razorpay/create-order", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: `ft_${Date.now()}`,
      });
      return res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
    } catch (err: any) {
      console.error("[Razorpay] create-order error:", err);
      return res.status(500).json({ message: "Failed to create payment order" });
    }
  });

  app.post("/api/razorpay/verify-payment", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ verified: false, message: "Missing fields" });
      }
      const secret = process.env.RAZORPAY_KEY_SECRET!;
      const generated = createHmac("sha256", secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      if (generated === razorpay_signature) {
        return res.json({ verified: true });
      }
      return res.status(400).json({ verified: false, message: "Signature mismatch" });
    } catch (err) {
      console.error("[Razorpay] verify error:", err);
      return res.status(500).json({ message: "Verification error" });
    }
  });

  // Orders routes
  app.post(api.orders.create.path, async (req, res) => {
    try {
      const input = api.orders.create.input.parse(req.body);

      // FIFO inventory deduction if hubDbName is provided
      if (input.hubDbName) {
        try {
          const hub = await getHubModels(input.hubDbName);
          for (const item of input.items) {
            const product = await hub.Product.findById(item.productId).lean() as any;
            if (!product || !product.inventoryBatches || product.inventoryBatches.length === 0) continue;

            // Sort batches by entryDate ascending (oldest first = FIFO)
            const sortedBatches = [...product.inventoryBatches].sort(
              (a: any, b: any) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
            );

            let remaining = item.quantity;
            for (const batch of sortedBatches) {
              if (remaining <= 0) break;
              const deduct = Math.min(batch.quantity, remaining);
              remaining -= deduct;
              if (deduct >= batch.quantity) {
                // Remove this batch entirely
                await hub.Product.findByIdAndUpdate(item.productId, {
                  $pull: { inventoryBatches: { _id: batch._id } },
                });
              } else {
                // Partially deduct from this batch
                await hub.Product.findOneAndUpdate(
                  { _id: item.productId, "inventoryBatches._id": batch._id },
                  { $inc: { "inventoryBatches.$.quantity": -deduct } }
                );
              }
            }
            // Recalculate total quantity from remaining batches
            const updated = await hub.Product.findById(item.productId).lean() as any;
            const totalQty = (updated.inventoryBatches ?? []).reduce((sum: number, b: any) => sum + b.quantity, 0);
            await hub.Product.findByIdAndUpdate(item.productId, { quantity: totalQty, updatedAt: new Date() });
          }
        } catch (deductErr) {
          console.error("FIFO deduction error:", deductErr);
        }
      }

      // Resolve coupon details and hub identity before persisting
      let resolvedCoupon: any = null;
      let resolvedSuperHubId: string | null = null;
      let resolvedSuperHubName: string | null = null;
      let resolvedSubHubId: string | null = null;
      let resolvedSubHubName: string | null = null;

      if (input.hubDbName) {
        try {
          const subHub = await SubHubModel.findOne({ dbName: input.hubDbName }).lean() as any;
          if (subHub) {
            resolvedSubHubId = subHub._id.toString();
            resolvedSubHubName = subHub.name;
            resolvedSuperHubId = subHub.superHubId?.toString() ?? null;
            // Look up SuperHub name
            if (subHub.superHubId) {
              try {
                const superHub = await SuperHubModel.findById(subHub.superHubId).lean() as any;
                if (superHub) resolvedSuperHubName = superHub.name;
              } catch { /* non-fatal */ }
            }
          }
        } catch (hubLookupErr) {
          console.error("Hub lookup error:", hubLookupErr);
        }

        if (input.couponCode) {
          try {
            const hub = await getHubModels(input.hubDbName);
            const code = String(input.couponCode).trim().toUpperCase();
            const coupon = await hub.Coupon.findOne({ code, isActive: true }).lean() as any;
            if (coupon) {
              // ── Server-side maxUsage enforcement (per-customer) ──────────────
              if (coupon.maxUsage != null && Number(coupon.maxUsage) > 0) {
                const couponId = String(coupon._id);
                const phone = String(input.phone ?? "");
                if (phone) {
                  const custDoc = await CustomerDbModel.findOne(
                    { phone },
                    { activeCoupons: 1, usedCoupons: 1 }
                  ).lean() as any;
                  const activeEntry = (custDoc?.activeCoupons ?? []).find(
                    (ac: any) => String(ac.couponId) === couponId
                  );
                  const activeCount = activeEntry
                    ? (activeEntry.usedCount != null ? Number(activeEntry.usedCount) : 1)
                    : 0;
                  const historicalCount = (custDoc?.usedCoupons ?? []).filter(
                    (uc: any) => String(uc.couponId) === couponId
                  ).length;
                  if (activeCount + historicalCount >= Number(coupon.maxUsage)) {
                    return res.status(400).json({ message: "CouponUsageLimitReached" });
                  }
                }
              }
              const cartTotal = (input.items as any[]).reduce(
                (sum: number, item: any) => sum + ((item.price ?? 0) * (item.quantity ?? 1)),
                0
              );
              const discountAmount =
                input.discountAmount ??
                (coupon.type === "flat"
                  ? Math.min(coupon.discountValue, cartTotal)
                  : Math.round((cartTotal * coupon.discountValue) / 100));
              resolvedCoupon = {
                couponId: coupon._id,
                code: coupon.code,
                couponTitle: coupon.title ?? "",
                discountType: coupon.type,
                discountValue: coupon.discountValue,
                discountAmount,
              };
            }
          } catch (couponLookupErr) {
            console.error("Coupon details lookup error:", couponLookupErr);
          }
        }
      }

      // Compute financials
      const itemsTotal = (input.items as any[]).reduce(
        (sum: number, item: any) => sum + ((item.price ?? 0) * (item.quantity ?? 1)), 0
      );
      const subtotal = input.subtotal ?? itemsTotal;
      const discount = input.discount ?? input.discountAmount ?? (resolvedCoupon?.discountAmount ?? 0);
      const slotCharge = input.slotCharge ?? input.instantDeliveryCharge ?? 0;
      const total = input.total ?? subtotal - discount + slotCharge;

      // Build coupon arrays
      const couponIds = resolvedCoupon ? [resolvedCoupon.couponId.toString()] : [];
      const couponCodes = resolvedCoupon ? [resolvedCoupon.code] : [];
      const coupons = resolvedCoupon ? [resolvedCoupon] : [];

      // Derive paymentMode
      const paymentMode = input.paymentMode ?? (input.paymentMethod === "upi" ? "upi" : "cash");

      // Today's date for deliveryDate fallback
      const now2 = new Date();
      const deliveryDate = input.deliveryDate ??
        `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}-${String(now2.getDate()).padStart(2, "0")}`;

      const cleanedItems = (input.items as any[]).map(({ productId, name, price, quantity, unit, imageUrl }) => ({
        productId,
        name,
        price,
        quantity,
        unit: unit ?? null,
        imageUrl: imageUrl ?? null,
      }));

      // Fetch customer email from DB if not provided in payload
      let resolvedEmail: string | null = input.email ?? null;
      if (!resolvedEmail && input.customerId) {
        try {
          const { CustomerDbModel } = await import("./customerDb");
          const cust = await CustomerDbModel.findById(input.customerId).select("email").lean() as any;
          if (cust?.email) resolvedEmail = cust.email;
        } catch { /* non-fatal */ }
      }

      // Build deliveryAddressDetail with _id as a plain string at the end
      // (matching admin POS format — not a Mongoose ObjectId / $oid object).
      const rawAddr = input.deliveryAddressDetail;
      const addrDetail = rawAddr
        ? {
            name: rawAddr.name ?? null,
            phone: rawAddr.phone ?? null,
            building: rawAddr.building ?? null,
            street: rawAddr.street ?? null,
            area: rawAddr.area ?? null,
            pincode: rawAddr.pincode ?? null,
            type: rawAddr.type ?? "house",
            label: rawAddr.label ?? "Home",
            instructions: rawAddr.instructions ?? "",
            _id: rawAddr._id ? String(rawAddr._id) : null,
          }
        : null;

      // Build orderInput in the exact field order used by the admin POS schema.
      // orderId is intentionally omitted here — it is appended LAST via
      // findByIdAndUpdate after the document is saved (matching admin behaviour).
      const orderInput: any = {
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        phone: input.phone,
        email: resolvedEmail,
        items: cleanedItems,
        subtotal,
        discount,
        slotCharge,
        total,
        deliveryType: input.deliveryType ?? "delivery",
        address: input.address,
        deliveryArea: input.deliveryArea,
        deliveryAddressDetail: addrDetail,
        pickupLocation: "",
        notes: input.notes ?? "",
        status: "pending",
        source: "online",
        subHubId: resolvedSubHubId ?? null,
        subHubName: resolvedSubHubName ?? null,
        superHubId: resolvedSuperHubId ?? null,
        superHubName: resolvedSuperHubName ?? null,
        couponIds,
        couponCodes,
        coupons,
        paymentStatus: input.paymentStatus ?? "unpaid",
        payments: input.payments ?? [],
        paidAmount: input.paidAmount ?? 0,
        dueAmount: input.dueAmount ?? total,
        paymentMode,
        scheduleType: input.scheduleType ?? "slot",
        deliveryDate,
        timeslotId: input.timeslotId ?? null,
        timeslotLabel: input.timeslotLabel ?? null,
        timeslotStart: input.timeslotStart ?? null,
        timeslotEnd: input.timeslotEnd ?? null,
      };

      const order = await storage.createOrderRequest(orderInput);

      // Generate orderId AFTER the document is saved — countDocuments gives the correct
      // shared sequence across admin + online orders, and $set appends orderId as the
      // last field (matching admin POS document structure).
      const generatedOrderId = await generateOrderId();
      // orderId and inventoryDeducted are set together in one update AFTER save,
      // so both appear after createdAt/updatedAt — matching admin POS field order exactly.
      await getOrderModel().findByIdAndUpdate(order.id, {
        $set: { orderId: generatedOrderId, inventoryDeducted: false },
      });

      const orderItemsTotal = (order.items as any[]).reduce((sum: number, item: any) => {
        return sum + ((item.price ?? 0) * (item.quantity ?? 1));
      }, 0);

      await storage.pushOrderToCustomer(order.phone, {
        orderId: generatedOrderId,
        customerName: order.customerName,
        phone: order.phone,
        deliveryArea: order.deliveryArea,
        address: order.address,
        items: order.items,
        status: order.status,
        notes: order.notes ?? null,
        total: (order as any).total ?? orderItemsTotal,
        placedAt: order.createdAt,
      });

      // Send order confirmation WhatsApp message (fire-and-forget)
      try {
        const itemsList = (order.items as any[])
          .map((item: any) => `• ${item.name} x${item.quantity ?? 1} — ₹${(item.price ?? 0) * (item.quantity ?? 1)}`)
          .join("\n");
        const paymentLabel = (order as any).paymentMethod === "upi" ? "UPI (Paid)" : "Cash on Delivery";
        sendWhatsApp("fishtokri_order_confirmed", order.phone, [
          order.customerName || "Customer",
          generatedOrderId,
          order.address || order.deliveryArea || "Your address",
          itemsList,
          total.toString(),
          paymentLabel,
        ]).catch(() => {});
      } catch (waErr) {
        console.error("[WhatsApp] Order confirmation error:", waErr);
      }

      // Track coupon in activeCoupons after successful order creation
      if (input.couponCode && input.hubDbName && resolvedCoupon) {
        try {
          await addActiveCoupon(
            order.phone,
            String(resolvedCoupon.couponId ?? ""),
            resolvedCoupon.code,
            resolvedCoupon.couponTitle ?? "",
            order.subHubId ?? "",
            order.id
          );
        } catch (couponErr) {
          console.error("Coupon usage update error:", couponErr);
        }
      }

      // Increment timeslot order count (today vs next-day) — match by startTime
      if (input.timeslotStart && input.hubDbName && input.scheduleType !== "instant") {
        try {
          const hub = await getHubModels(input.hubDbName);
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          const countField = (input.deliveryDate && input.deliveryDate !== todayStr) ? "nextDayOrderCount" : "todaysOrderCount";
          await hub.Timeslot.findOneAndUpdate(
            { startTime: input.timeslotStart },
            { $inc: { [countField]: 1 } },
            { strict: false }
          );
        } catch (timeslotCountErr) {
          console.error("[Timeslot] Count increment error:", timeslotCountErr);
        }
      }

      // Deduct wallet balance — read from payments[].mode === "wallet" (admin-compatible)
      const walletPayments = (input.payments ?? []).filter((p: any) => p.mode === "wallet");
      const walletUsed = walletPayments.reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
      if (walletUsed > 0 && input.customerId) {
        try {
          await CustomerDbModel.findByIdAndUpdate(input.customerId, {
            $inc: { walletBalance: -walletUsed },
          });
          console.log(`[Wallet] Deducted ₹${walletUsed} from customer ${input.customerId}`);
        } catch (walletErr) {
          console.error("[Wallet] Deduction error:", walletErr);
        }
      }

      res.status(201).json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.orders.list.path, requireAuth, async (req, res) => {
    const orders = await storage.getOrderRequests();
    res.json(orders);
  });

  app.get("/api/orders/by-phone/:phone", async (req, res) => {
    const { phone } = req.params;
    if (!phone) return res.status(400).json({ message: "Phone required" });
    const orders = await storage.getOrdersByPhone(phone);
    res.json(orders);
  });

  app.patch(api.orders.updateStatus.path, requireAuth, async (req, res) => {
    try {
      const input = api.orders.updateStatus.input.parse(req.body);

      // Fetch old order before updating so we know the previous status
      const oldOrder = await storage.getOrderRequest(req.params.id);
      const oldStatus = oldOrder?.status ?? "pending";

      const order = await storage.updateOrderRequestStatus(req.params.id, input.status);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      await storage.updateCustomerOrderStatus(order.phone, order.id, input.status);

      // ── Coupon lifecycle ────────────────────────────────────────────────
      const couponCode = order.coupon?.code;
      const couponId   = order.coupon?.couponId ?? "";
      if (couponCode && couponId) {
        const ACTIVE_STATUSES = new Set(["pending", "confirmed", "out_for_delivery", "takeaway"]);
        const wasActive    = ACTIVE_STATUSES.has(oldStatus);
        const isNowActive  = ACTIVE_STATUSES.has(input.status);
        const wasCancelled = oldStatus === "cancelled";
        const isDelivered  = input.status === "delivered";
        const isCancelled  = input.status === "cancelled";

        try {
          const couponTitle = order.coupon?.couponTitle ?? "";

          if (wasActive && isCancelled) {
            // Order cancelled → release coupon back
            await removeActiveCoupon(order.phone, couponId, order.id);
          } else if (wasActive && isDelivered) {
            // Order delivered → move coupon to permanent history
            await removeActiveCoupon(order.phone, couponId, order.id);
            await addDeliveredCoupon(order.phone, couponId, couponCode, couponTitle, order.subHubId ?? "", order.id);
          } else if (wasCancelled && isDelivered) {
            // Cancelled → delivered (rare): push directly to permanent history, no active entry to remove
            await addDeliveredCoupon(order.phone, couponId, couponCode, couponTitle, order.subHubId ?? "", order.id);
          } else if (wasCancelled && isNowActive) {
            // Un-cancel → re-lock coupon in active orders
            await addActiveCoupon(order.phone, couponId, couponCode, couponTitle, order.subHubId ?? "", order.id);
          } else if (oldStatus === "delivered" && isNowActive) {
            // Un-deliver → move coupon back to active
            await removeDeliveredCoupon(order.phone, couponId, order.id);
            await addActiveCoupon(order.phone, couponId, couponCode, couponTitle, order.subHubId ?? "", order.id);
          }
        } catch (couponLifecycleErr) {
          console.error("[Coupon lifecycle] Error:", couponLifecycleErr);
        }
      }

      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Coupon apply / validate ──────────────────────────────────────────────
  app.post("/api/coupon/apply", async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ valid: false, message: "No hub selected" });

      const { couponCode, cartTotal, userId } = req.body;
      if (!couponCode || cartTotal === undefined) {
        return res.status(400).json({ valid: false, message: "Missing required fields" });
      }

      const code = String(couponCode).trim().toUpperCase();

      // ── Step 1: Check coupon exists and is active ─────────────────────────
      const coupon = await hub.Coupon.findOne({ code, isActive: true }).lean() as any;
      if (!coupon) {
        return res.json({ valid: false, message: "Invalid or inactive coupon code" });
      }
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return res.json({ valid: false, message: "This coupon has expired" });
      }
      if ((coupon.minOrderAmount ?? 0) > cartTotal) {
        return res.json({ valid: false, message: `Minimum order of ₹${coupon.minOrderAmount} required` });
      }

      // ── Step 2: Per-user coupon usage check (activeCoupons + usedCoupons) ──
      if (userId) {
        const phone = String(userId);
        const couponId = String(coupon._id);

        const custDoc = await CustomerDbModel.findOne(
          { phone },
          { activeCoupons: 1, usedCoupons: 1 }
        ).lean() as any;

        // Active usage: find entry in activeCoupons keyed by couponId
        const activeEntry = (custDoc?.activeCoupons ?? []).find(
          (ac: any) => String(ac.couponId) === couponId
        );
        const activeCount = activeEntry
          ? (activeEntry.usedCount != null ? Number(activeEntry.usedCount) : 1)
          : 0;

        // Historical usage: count entries in usedCoupons (one per delivered order)
        const historicalCount = (custDoc?.usedCoupons ?? []).filter(
          (uc: any) => String(uc.couponId) === couponId
        ).length;

        const totalUsed = activeCount + historicalCount;

        // Per-customer limit: isFirstTimeOnly → 1; maxUsage > 0 → that value; else unlimited
        const isFirstTimeOnly = coupon.isFirstTimeOnly || code === "WELCOME100";
        const perCustomerLimit: number | null = isFirstTimeOnly
          ? 1
          : (coupon.maxUsage != null && coupon.maxUsage > 0 ? coupon.maxUsage : null);

        if (perCustomerLimit !== null && totalUsed >= perCustomerLimit) {
          const message = isFirstTimeOnly
            ? (code === "WELCOME100" ? "WELCOME100 can be used only once per account" : "This coupon is for first-time use only")
            : `Coupon usage limit reached (max ${perCustomerLimit} use${perCustomerLimit === 1 ? "" : "s"} per customer)`;
          return res.json({ valid: false, message });
        }
      }

      const discountAmount = coupon.type === "flat"
        ? Math.min(coupon.discountValue, cartTotal)
        : Math.round((cartTotal * coupon.discountValue) / 100);

      return res.json({ valid: true, discountAmount, message: "Coupon applied successfully" });
    } catch (err) {
      console.error("Coupon apply error:", err);
      res.status(500).json({ valid: false, message: "Failed to validate coupon" });
    }
  });

  // ── Coupon user-usage endpoint (for frontend per-user limit checks) ──────
  app.get("/api/coupons/user-usage", async (req, res) => {
    try {
      const phone = (req.session as any).customerPhone as string | undefined;
      if (!phone) return res.json({});

      const hub = await getReqHubModels(req);
      if (!hub) return res.json({});

      const [customer, coupons] = await Promise.all([
        CustomerDbModel.findOne({ phone }, { activeCoupons: 1, usedCoupons: 1 }).lean() as any,
        hub.Coupon.find({ isActive: true }).lean() as any[],
      ]);

      const allUsedCoupons: any[] = customer?.usedCoupons ?? [];
      const activeCoupons: any[] = customer?.activeCoupons ?? [];

      const result: Record<string, { usedCount: number; limit: number | null; isExhausted: boolean; message: string }> = {};
      for (const coupon of coupons) {
        const couponId = String(coupon._id);

        // Active usage: usedCount from activeCoupons entry (non-delivered orders)
        const activeEntry = activeCoupons.find((ac: any) => String(ac.couponId) === couponId);
        const activeCount = activeEntry
          ? (activeEntry.usedCount != null ? Number(activeEntry.usedCount) : 1)
          : 0;

        // Historical usage: count entries in usedCoupons (one per delivered order)
        const historicalCount = allUsedCoupons.filter(
          (uc: any) => String(uc.couponId) === couponId
        ).length;

        const usedCount = activeCount + historicalCount;

        // Per-customer limit: isFirstTimeOnly → 1; maxUsage > 0 → that value; else unlimited
        const isFirstTimeOnly = coupon.isFirstTimeOnly || coupon.code === "WELCOME100";
        const limit: number | null = isFirstTimeOnly
          ? 1
          : (coupon.maxUsage != null && coupon.maxUsage > 0 ? coupon.maxUsage : null);

        const isExhausted = limit !== null && usedCount >= limit;
        const message = isExhausted
          ? isFirstTimeOnly
            ? coupon.code === "WELCOME100"
              ? "WELCOME100 can be used only once per account"
              : "This coupon is for first-time use only"
            : `Coupon usage limit reached (max ${limit} use${limit === 1 ? "" : "s"} per customer)`
          : "";
        result[coupon.code] = { usedCount, limit, isExhausted, message };
      }
      return res.json(result);
    } catch (err) {
      console.error("User usage fetch error:", err);
      res.status(500).json({});
    }
  });

  // ── Coupon routes ────────────────────────────────────────────────────────
  app.get("/api/coupons", async (req, res) => {
    const hub = await getReqHubModels(req);
    if (!hub) return res.json([]);
    const docs = await hub.Coupon.find({ isActive: true }).lean();
    res.json(docs.map(toCoupon));
  });

  app.get("/api/coupons/product/:productId", async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.json([]);
      const product = await hub.Product.findById(req.params.productId).lean() as any;
      if (!product) return res.status(404).json({ message: "Product not found" });
      const couponIds = (product.couponIds ?? []).map((id: any) => id.toString());
      if (couponIds.length === 0) return res.json([]);
      const docs = await hub.Coupon.find({ _id: { $in: couponIds }, isActive: true }).lean();
      res.json(docs.map(toCoupon));
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch product coupons" });
    }
  });

  app.post("/api/coupons", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const doc = await hub.Coupon.create({ ...req.body, createdAt: new Date(), updatedAt: new Date() });
      res.status(201).json(toCoupon(doc));
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create coupon" });
    }
  });

  app.patch("/api/coupons/:id", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const doc = await hub.Coupon.findByIdAndUpdate(
        req.params.id,
        { ...req.body, updatedAt: new Date() },
        { new: true }
      ).lean();
      if (!doc) return res.status(404).json({ message: "Coupon not found" });
      res.json(toCoupon(doc));
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update coupon" });
    }
  });

  app.delete("/api/coupons/:id", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      await hub.Coupon.findByIdAndDelete(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to delete coupon" });
    }
  });

  // ── Coupon location usage limits (admin) ──────────────────────────────────
  // GET all location usage docs for this hub
  app.get("/api/coupon-location-usage", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.json([]);
      const docs = await hub.CouponLocationUsage.find({}).lean();
      res.json(docs);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch coupon location usage" });
    }
  });

  // PATCH: set or update maxUsageLimit for a coupon in this location
  app.patch("/api/coupon-location-usage/:couponCode", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const code = req.params.couponCode.toUpperCase();
      const { maxUsageLimit } = req.body;
      const doc = await hub.CouponLocationUsage.findOneAndUpdate(
        { couponCode: code },
        { maxUsageLimit: maxUsageLimit ?? null },
        { upsert: true, new: true }
      ).lean();
      res.json(doc);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update location usage limit" });
    }
  });

  // Assign coupons to a product
  app.patch("/api/products/:id/coupons", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const { couponIds } = req.body as { couponIds: string[] };
      const doc = await hub.Product.findByIdAndUpdate(
        req.params.id,
        { couponIds, updatedAt: new Date() },
        { new: true }
      ).lean();
      if (!doc) return res.status(404).json({ message: "Product not found" });
      res.json(toProduct(doc));
    } catch (err) {
      res.status(500).json({ message: "Failed to update product coupons" });
    }
  });

  // Carousel routes
  app.get("/api/carousel", async (req, res) => {
    const hub = await getReqHubModels(req);
    if (!hub) return res.json([]);
    const docs = await hub.Carousel.find({ isActive: true }).sort({ order: 1 }).lean();
    res.json(docs.map(toCarousel));
  });

  app.post("/api/carousel", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertCarouselSlideSchema.parse(req.body);
      const doc = await hub.Carousel.create(input);
      res.status(201).json(toCarousel(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/carousel/:id", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertCarouselSlideSchema.partial().parse(req.body);
      const doc = await hub.Carousel.findByIdAndUpdate(req.params.id, input, { new: true }).lean();
      if (!doc) return res.status(404).json({ message: "Slide not found" });
      res.json(toCarousel(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/carousel/:id", requireAuth, async (req, res) => {
    const hub = await getReqHubModels(req);
    if (hub) await hub.Carousel.findByIdAndDelete(req.params.id);
    res.status(204).end();
  });

  // Category routes
  app.get("/api/categories", async (req, res) => {
    const hub = await getReqHubModels(req);
    if (!hub) return res.json([]);
    const docs = await hub.Category.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    res.json(docs.map(toCategory));
  });

  app.post("/api/categories", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertCategorySchema.parse(req.body);
      const doc = await hub.Category.findOneAndUpdate(
        { name: input.name },
        { $set: input },
        { new: true, upsert: true }
      ).lean();
      res.status(201).json(toCategory(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/categories/:id", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertCategorySchema.partial().parse(req.body);
      const doc = await hub.Category.findByIdAndUpdate(req.params.id, { $set: input }, { new: true }).lean();
      if (!doc) return res.status(404).json({ message: "Category not found" });
      res.json(toCategory(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/categories/:id", requireAuth, async (req, res) => {
    const hub = await getReqHubModels(req);
    if (hub) await hub.Category.findByIdAndUpdate(req.params.id, { isActive: false });
    res.status(204).end();
  });

  // Sections routes
  app.get("/api/sections", async (req, res) => {
    const hub = await getReqHubModels(req);
    if (!hub) return res.json([]);
    const docs = await hub.Section.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    res.json(docs.map(toSection));
  });

  app.post("/api/sections", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertSectionSchema.parse(req.body);
      const doc = await hub.Section.create({
        ...input,
        type: input.type ?? "products",
        isActive: input.isActive ?? true,
      });
      res.status(201).json(toSection(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/sections/:id", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertSectionSchema.partial().parse(req.body);
      const doc = await hub.Section.findByIdAndUpdate(req.params.id, { $set: input }, { new: true }).lean();
      if (!doc) return res.status(404).json({ message: "Section not found" });
      res.json(toSection(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/sections/:id", requireAuth, async (req, res) => {
    const hub = await getReqHubModels(req);
    if (hub) await hub.Section.findByIdAndDelete(req.params.id);
    res.status(204).end();
  });

  // Combo routes
  app.get("/api/combos", async (req, res) => {
    const hub = await getReqHubModels(req);
    if (!hub) return res.json([]);
    const docs = await hub.Combo.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    res.json(docs.map(toCombo));
  });

  app.get("/api/combos/:id", async (req, res) => {
    const hub = await getReqHubModels(req);
    if (!hub) return res.status(404).json({ message: "Combo not found" });
    const doc = await hub.Combo.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Combo not found" });
    res.json(toCombo(doc));
  });

  app.post("/api/combos", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertComboSchema.parse(req.body);
      const doc = await hub.Combo.create({
        ...input,
        isActive: (input as any).isActive ?? true,
        sortOrder: (input as any).sortOrder ?? 0,
      });
      res.status(201).json(toCombo(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/combos/:id", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      const input = insertComboSchema.partial().parse(req.body);
      const doc = await hub.Combo.findByIdAndUpdate(req.params.id, { $set: input }, { new: true }).lean();
      if (!doc) return res.status(404).json({ message: "Combo not found" });
      res.json(toCombo(doc));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/combos/:id", requireAuth, async (req, res) => {
    const hub = await getReqHubModels(req);
    if (hub) await hub.Combo.findByIdAndUpdate(req.params.id, { isActive: false });
    res.status(204).end();
  });

  // ── Timeslot routes ─────────────────────────────────────────────────────
  const DEFAULT_TIMESLOTS = [
    { label: "Early Morning Delivery", startTime: "5:30 AM", endTime: "7:00 AM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 1 },
    { label: "Morning Delivery", startTime: "7:00 AM", endTime: "8:30 AM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 2 },
    { label: "Late Morning Delivery", startTime: "9:00 AM", endTime: "10:30 AM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 3 },
    { label: "Midday Delivery", startTime: "11:00 AM", endTime: "12:30 PM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 4 },
    { label: "Afternoon Delivery", startTime: "2:00 PM", endTime: "3:30 PM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 5 },
    { label: "Late Afternoon Delivery", startTime: "4:00 PM", endTime: "5:30 PM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 6 },
    { label: "Evening Delivery", startTime: "6:00 PM", endTime: "7:30 PM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 7 },
    { label: "Night Delivery", startTime: "8:00 PM", endTime: "9:30 PM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 8 },
    { label: "Late Night Delivery", startTime: "10:00 PM", endTime: "11:30 PM", isInstant: false, extraCharge: 0, isActive: true, sortOrder: 9 },
  ];

  const INSTANT_TIMESLOT = {
    id: "instant",
    label: "Instant Delivery",
    startTime: null,
    endTime: null,
    isInstant: true,
    extraCharge: 49,
    isActive: true,
    sortOrder: 0,
  };

  const toTimeslot = (doc: any) => ({
    id: doc._id.toString(),
    label: doc.label,
    startTime: doc.startTime ?? null,
    endTime: doc.endTime ?? null,
    isInstant: doc.isInstant ?? false,
    extraCharge: doc.extraCharge ?? 0,
    isActive: doc.isActive ?? true,
    sortOrder: doc.sortOrder ?? 0,
    orderLimit: doc.orderLimit ?? 10,
    todaysOrderCount: doc.todaysOrderCount ?? 0,
    nextDayOrderCount: doc.nextDayOrderCount ?? 0,
    limitedByOrders: doc.limitedByOrders ?? false,
  });

  app.get("/api/timeslots", async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.json([]);
      const docs = await hub.Timeslot.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
      res.json(docs.map(toTimeslot));
    } catch {
      res.json([]);
    }
  });

  // Seed default timeslots into the hub DB (admin only)
  app.post("/api/timeslots/seed", requireAuth, async (req, res) => {
    try {
      const hub = await getReqHubModels(req);
      if (!hub) return res.status(400).json({ message: "No hub selected" });
      await hub.Timeslot.deleteMany({ isInstant: { $ne: true } });
      await hub.Timeslot.insertMany(DEFAULT_TIMESLOTS);
      const docs = await hub.Timeslot.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
      res.json([INSTANT_TIMESLOT, ...docs.map(toTimeslot)]);
    } catch (err) {
      res.status(500).json({ message: "Failed to seed timeslots" });
    }
  });

  // ── Customer auth & profile routes ──────────────────────────────────────

  const requireCustomer = (req: any, res: any, next: any) => {
    if (req.session?.customerPhone) return next();
    res.status(401).json({ message: "Not logged in" });
  };

  app.post("/api/customer/request-otp", async (req, res) => {
    const { phone } = req.body;
    if (!phone || !/^\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ message: "Valid 10-digit phone number required" });
    }
    const normalised = String(phone).trim();

    // Generate a secure 4-digit OTP
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    otpStore.set(normalised, { otp, expiresAt: Date.now() + OTP_TTL_MS });

    // Send via AiSensy WhatsApp
    const apiKey = process.env.AISENSY_API_KEY;
    const userName = process.env.AISENSY_USERNAME || "ATHA FOODS PRIVATE LIMITED";
    if (!apiKey) {
      console.error("[OTP] AISENSY_API_KEY not set — OTP not sent via WhatsApp");
      return res.json({ message: "OTP sent" });
    }

    try {
      const destination = `91${normalised}`;
      const payload = {
        apiKey,
        campaignName: "Fishtokriotp",
        destination,
        userName,
        templateParams: [otp],
        source: "fishtokri-app",
        media: {},
        buttons: [
          {
            type: "button",
            sub_type: "url",
            index: 0,
            parameters: [{ type: "text", text: otp }],
          },
        ],
        carouselCards: [],
        location: {},
        attributes: { name: otp },
        paramsFallbackValue: { FirstName: otp },
      };

      console.log(`[OTP] Sending payload to AiSensy:`, JSON.stringify(payload, null, 2));

      const response = await fetch("https://backend.aisensy.com/campaign/t1/api/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      console.log(`[OTP] AiSensy response ${response.status}:`, responseText);

      if (!response.ok) {
        console.error(`[OTP] AiSensy error ${response.status}: ${responseText}`);
        return res.status(502).json({ message: "Failed to send OTP. Please try again." });
      }

      console.log(`[OTP] Sent to ${destination} via AiSensy`);
    } catch (err) {
      console.error("[OTP] AiSensy request failed:", err);
      return res.status(502).json({ message: "Failed to send OTP. Please try again." });
    }

    res.json({ message: "OTP sent" });
  });

  app.post("/api/customer/verify-otp", async (req, res) => {
    try {
      const { phone, otp } = req.body;
      if (!phone || !otp) return res.status(400).json({ message: "phone and otp required" });
      const normalised = String(phone).trim();
      const entry = otpStore.get(normalised);
      if (!entry || Date.now() > entry.expiresAt || entry.otp !== String(otp).trim()) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      // Only delete the OTP AFTER a successful upsert so users can retry if DB fails
      const customer = await storage.upsertCustomer(normalised, { phone: normalised });
      otpStore.delete(normalised);

      req.session.customerPhone = normalised;

      // Explicitly save the session before responding to avoid race condition
      // where the response is sent before the session is written to MongoDB
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      // Send welcome WhatsApp message (fire-and-forget)
      const displayName = (customer as any)?.name || "there";
      sendWhatsApp("fishtokri_welcome", normalised, [displayName]).catch(() => {});

      res.json(customer);
    } catch (err: any) {
      console.error("[verify-otp] Error:", err);
      res.status(500).json({ message: "Failed to verify OTP. Please try again." });
    }
  });

  app.get("/api/customer/me", requireCustomer, async (req, res) => {
    const customer = await storage.getCustomerByPhone(req.session.customerPhone!);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.patch("/api/customer/me", requireCustomer, async (req, res) => {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const customer = await storage.updateCustomer(req.session.customerPhone!, parsed.data);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post("/api/customer/me/addresses", requireCustomer, async (req, res) => {
    const parsed = insertCustomerAddressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const customer = await storage.addCustomerAddress(req.session.customerPhone!, parsed.data);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.patch("/api/customer/me/addresses/:addrId", requireCustomer, async (req, res) => {
    const parsed = insertCustomerAddressSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const customer = await storage.updateCustomerAddress(req.session.customerPhone!, req.params.addrId, parsed.data);
    if (!customer) return res.status(404).json({ message: "Not found" });
    res.json(customer);
  });

  app.delete("/api/customer/me/addresses/:addrId", requireCustomer, async (req, res) => {
    const customer = await storage.deleteCustomerAddress(req.session.customerPhone!, req.params.addrId);
    if (!customer) return res.status(404).json({ message: "Not found" });
    res.json(customer);
  });

  app.get("/api/customer/me/orders", requireCustomer, async (req, res) => {
    const phone = req.session.customerPhone!;
    try {
      const orders = await storage.getOrdersByPhone(phone);

      // Enrich order items that are missing imageUrl by looking up the product
      // in the hub's products collection using subHubName + productId.
      const enriched = await Promise.all(orders.map(async (order) => {
        const items: any[] = Array.isArray(order.items) ? order.items : [];
        const dbName = order.subHubName;

        const missingIds = items
          .filter(i => !i.imageUrl && i.productId)
          .map(i => String(i.productId));

        let imageMap: Record<string, string> = {};
        if (missingIds.length > 0 && dbName) {
          try {
            const { getHubModels } = await import("./hubConnections");
            const { Product } = await getHubModels(dbName);
            const products = await (Product as any).find(
              { _id: { $in: missingIds } },
              { imageUrl: 1 }
            ).lean() as any[];
            for (const p of products) {
              if (p.imageUrl) imageMap[String(p._id)] = p.imageUrl;
            }
          } catch { /* ignore hub lookup failures */ }
        }

        const enrichedItems = items.map(item => ({
          ...item,
          imageUrl: item.imageUrl || imageMap[String(item.productId)] || null,
        }));

        return { ...order, items: enrichedItems };
      }));

      res.json(enriched);
    } catch {
      res.json([]);
    }
  });

  app.post("/api/customer/logout", (req, res) => {
    delete req.session.customerPhone;
    res.json({ message: "Logged out" });
  });

  // ── Admin customers route ────────────────────────────────────────────────
  app.get("/api/admin/customers", requireAuth, async (_req, res) => {
    try {
      const customers = await storage.getAllCustomers();
      res.json(customers);
    } catch {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  return httpServer;
}
