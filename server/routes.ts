import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import passport from "passport";
import { setupAuth } from "./auth";
import { connectOrdersDb } from "./ordersDb";
import { setImage, getImage, deleteImage } from "./imageStore";
import { insertCarouselSlideSchema, insertCategorySchema, insertSectionSchema, insertComboSchema, insertCustomerAddressSchema, updateCustomerSchema, insertInventoryBatchSchema } from "@shared/schema";
import { SuperHubModel, SubHubModel } from "./adminDb";
import { getHubModels } from "./hubConnections";
import { CustomerDbModel } from "./customerDb";
import { computeExpiryDate, computeRemainingTime } from "./inventorySync";

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
        pincodes: h.pincodes ?? [],
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
    usedCount: doc.usedCount ?? 0, isFirstTimeOnly: doc.isFirstTimeOnly ?? false,
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

  // Orders routes
  app.post(api.orders.create.path, async (req, res) => {
    try {
      const input = api.orders.create.input.parse(req.body);

      // Generate sequential FTW order ID (web orders)
      let generatedOrderId: string | null = null;
      try {
        const OrderModel = getOrderModel();
        const count = await OrderModel.countDocuments();
        generatedOrderId = `FTW-${String(count + 1).padStart(4, "0")}`;
      } catch { /* non-fatal — will fall back to MongoDB id */ }

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
      let resolvedSuperHubId: any = null;
      let resolvedSubHubId: any = null;
      let resolvedSubHubName: string | null = null;

      if (input.hubDbName) {
        try {
          const subHub = await SubHubModel.findOne({ dbName: input.hubDbName }).lean() as any;
          if (subHub) {
            resolvedSubHubId = subHub._id;
            resolvedSuperHubId = subHub.superHubId;
            resolvedSubHubName = subHub.name;
          }
        } catch (hubLookupErr) {
          console.error("Hub lookup error:", hubLookupErr);
        }

        if (input.couponCode) {
          try {
            const hub = await getHubModels(input.hubDbName);
            const code = String(input.couponCode).trim().toUpperCase();
            const coupon = await hub.Coupon.findOne({ code }).lean() as any;
            if (coupon) {
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

      const orderInput = {
        ...input,
        ...(generatedOrderId && { orderId: generatedOrderId }),
        ...(resolvedCoupon && { coupon: resolvedCoupon }),
        ...(resolvedSuperHubId && { superHubId: resolvedSuperHubId }),
        ...(resolvedSubHubId && { subHubId: resolvedSubHubId }),
        ...(resolvedSubHubName && { subHubName: resolvedSubHubName }),
      };

      const order = await storage.createOrderRequest(orderInput);

      const total = (order.items as any[]).reduce((sum: number, item: any) => {
        return sum + ((item.price ?? 0) * (item.quantity ?? 1));
      }, 0);

      await storage.pushOrderToCustomer(order.phone, {
        orderId: order.orderId ?? order.id,
        customerName: order.customerName,
        phone: order.phone,
        deliveryArea: order.deliveryArea,
        address: order.address,
        items: order.items,
        status: order.status,
        notes: order.notes ?? null,
        total,
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
          order.orderId ?? order.id,
          order.address || order.deliveryArea || "Your address",
          itemsList,
          total.toString(),
          paymentLabel,
        ]).catch(() => {});
      } catch (waErr) {
        console.error("[WhatsApp] Order confirmation error:", waErr);
      }

      // Increment coupon usage after successful order
      if (input.couponCode && input.hubDbName) {
        try {
          const hub = await getHubModels(input.hubDbName);
          const code = String(input.couponCode).trim().toUpperCase();
          const location = input.hubDbName; // hub dbName IS the location key

          // Always increment global usedCount on the coupon document
          const coupon = await hub.Coupon.findOneAndUpdate(
            { code },
            { $inc: { usedCount: 1 }, updatedAt: new Date() },
            { new: true }
          ).lean() as any;

          // Increment CouponLocationUsage (upsert) — tracks per-location global cap
          await hub.CouponLocationUsage.findOneAndUpdate(
            { couponCode: code },
            { $inc: { usedCount: 1 } },
            { upsert: true }
          );

          // WELCOME100 (isFirstTimeOnly): also keep legacy CouponUsage for backward compat
          if (code === "WELCOME100" || coupon?.isFirstTimeOnly) {
            await hub.CouponUsage.findOneAndUpdate(
              { userId: order.phone, couponCode: code },
              { $inc: { usageCount: 1 }, lastUsedAt: new Date() },
              { upsert: true }
            );
          }

          // ALL coupons: track in customer.usedCoupons per location (unified)
          // Fetch the current entry first so we can compute the exact new count
          // (avoids $inc on null and arrayFilter reliability issues)
          const maxAllowed = coupon?.perUserLimit ?? null;
          const customerUsageDoc = await CustomerDbModel.findOne(
            { phone: order.phone },
            { usedCoupons: 1 }
          ).lean() as any;

          const existingEntry = (customerUsageDoc?.usedCoupons ?? []).find(
            (u: any) => u.code === code && u.location === location
          );

          if (existingEntry) {
            // Subsequent use — compute exact new count and $set it (never $inc on potentially-null)
            const currentCount = typeof existingEntry.usedCount === "number" && existingEntry.usedCount > 0
              ? existingEntry.usedCount
              : 0;
            // $elemMatch ensures both code AND location match the SAME array element
            // so the $ positional operator updates the correct entry, not a sibling entry
            await CustomerDbModel.updateOne(
              { phone: order.phone, usedCoupons: { $elemMatch: { code, location } } },
              {
                $set: {
                  "usedCoupons.$.usedCount": currentCount + 1,
                  "usedCoupons.$.lastUsedAt": new Date(),
                },
              }
            );
          } else {
            // First use — push a fresh entry with usedCount explicitly set to 1
            await CustomerDbModel.updateOne(
              { phone: order.phone },
              {
                $push: {
                  usedCoupons: {
                    couponId: coupon?._id ?? null,
                    code,
                    usedCount: 1,
                    maxAllowed,
                    location,
                    lastUsedAt: new Date(),
                  },
                },
              }
            );
          }
        } catch (couponErr) {
          console.error("Coupon usage update error:", couponErr);
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
      const order = await storage.updateOrderRequestStatus(req.params.id, input.status);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      await storage.updateCustomerOrderStatus(order.phone, order.id, input.status);
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
      // Location = hub dbName from the X-Hub-DB header (e.g. "Thane")
      const location = (req.headers["x-hub-db"] as string | undefined) ?? "unknown";

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

      // ── Step 2: Per-user coupon usage check (via customer.usedCoupons) ────
      if (userId) {
        const phone = String(userId);

        // Fetch the user's usage entry for this coupon at this location.
        // $elemMatch ensures BOTH code and location match on the SAME array element,
        // so the $ positional operator returns the correct entry and not a sibling entry.
        const customer = await CustomerDbModel.findOne(
          { phone, usedCoupons: { $elemMatch: { code, location } } },
          { "usedCoupons.$": 1 }
        ).lean() as any;
        const userEntry = customer?.usedCoupons?.[0];
        // If entry exists but usedCount is null/non-numeric (corrupted data), treat as 1
        // because the entry's existence confirms at least one past use
        const rawUsedCount = userEntry?.usedCount;
        const userUsedCount = userEntry
          ? (typeof rawUsedCount === "number" && rawUsedCount > 0 ? rawUsedCount : 1)
          : 0;

        if (coupon.isFirstTimeOnly || code === "WELCOME100") {
          // Single-use per user: block if they've used it at all
          if (userUsedCount >= 1) {
            return res.json({ valid: false, message: code === "WELCOME100" ? "WELCOME100 can be used only once per account" : "This coupon is for first-time use only" });
          }
          // Also check legacy CouponUsage for backward compatibility
          const legacy = await hub.CouponUsage.findOne({ userId: phone, couponCode: code }).lean() as any;
          if (legacy && (legacy.usageCount ?? 0) >= 1) {
            return res.json({ valid: false, message: code === "WELCOME100" ? "WELCOME100 can be used only once per account" : "This coupon is for first-time use only" });
          }
        } else {
          // Default max 3 uses per user, unless coupon has a custom perUserLimit
          const limit = (coupon.perUserLimit !== null && coupon.perUserLimit !== undefined) ? coupon.perUserLimit : 3;
          if (userUsedCount >= limit) {
            return res.json({ valid: false, message: `Coupon usage limit reached (max ${limit} use${limit === 1 ? "" : "s"} per customer)` });
          }
        }
      }

      // ── Step 3: Check location-level global usage cap ─────────────────────
      // maxUsageLimit of 0 means unlimited — only enforce when maxUsageLimit > 0
      const locUsage = await hub.CouponLocationUsage.findOne({ couponCode: code }).lean() as any;
      if (locUsage && locUsage.maxUsageLimit !== null && locUsage.maxUsageLimit !== undefined && locUsage.maxUsageLimit > 0) {
        if ((locUsage.usedCount ?? 0) >= locUsage.maxUsageLimit) {
          return res.json({ valid: false, message: "This coupon has reached its usage limit for your location" });
        }
      }

      // ── Step 4: Check global maxUsage on the coupon document ─────────────
      // maxUsage of 0 (or null/undefined) means unlimited — only enforce when maxUsage > 0
      if (coupon.maxUsage !== null && coupon.maxUsage !== undefined && coupon.maxUsage > 0 && (coupon.usedCount ?? 0) >= coupon.maxUsage) {
        return res.json({ valid: false, message: "This coupon has reached its usage limit" });
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

      const location = (req.headers["x-hub-db"] as string | undefined) ?? "unknown";

      const [customer, coupons] = await Promise.all([
        CustomerDbModel.findOne({ phone }, { usedCoupons: 1 }).lean() as any,
        hub.Coupon.find({ isActive: true }).lean() as any[],
      ]);

      const userUsedCoupons: any[] = (customer?.usedCoupons ?? []).filter(
        (u: any) => u.location === location
      );

      const result: Record<string, { usedCount: number; limit: number; isExhausted: boolean; message: string }> = {};
      for (const coupon of coupons) {
        const userEntry = userUsedCoupons.find((u: any) => u.code === coupon.code);
        // If entry exists but usedCount is null/corrupt, treat as 1 (entry confirms at least one use)
        const rawCount = userEntry?.usedCount;
        const usedCount = userEntry
          ? (typeof rawCount === "number" && rawCount > 0 ? rawCount : 1)
          : 0;
        const isFirstTimeOnly = coupon.isFirstTimeOnly || coupon.code === "WELCOME100";
        const limit = isFirstTimeOnly ? 1 : ((coupon.perUserLimit !== null && coupon.perUserLimit !== undefined) ? coupon.perUserLimit : 3);
        const isExhausted = usedCount >= limit;
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
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "phone and otp required" });
    const normalised = String(phone).trim();
    const entry = otpStore.get(normalised);
    if (!entry || Date.now() > entry.expiresAt || entry.otp !== String(otp).trim()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    otpStore.delete(normalised);
    const customer = await storage.upsertCustomer(normalised, { phone: normalised });
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
      res.json(orders);
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
