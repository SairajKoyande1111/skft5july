import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

let ordersConnection: mongoose.Connection | null = null;

const orderCouponSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, default: null },
    code: { type: String, default: null },
    discountType: { type: String, default: null },
    discountValue: { type: Number, default: null },
    discountAmount: { type: Number, default: null },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema({
  orderId: { type: String, default: null },
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  deliveryArea: { type: String, required: true },
  address: { type: String, required: true },
  items: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, default: "pending" },
  notes: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  deliveryType: { type: String, default: null },
  timeslotLabel: { type: String, default: null },
  instantDeliveryCharge: { type: Number, default: null },
  coupon: { type: orderCouponSchema, default: null },
  paymentMethod: { type: String, default: null },
  superHubId: { type: mongoose.Schema.Types.ObjectId, default: null },
  subHubId: { type: mongoose.Schema.Types.ObjectId, default: null },
  subHubName: { type: String, default: null },
});

export async function connectOrdersDb() {
  if (!ordersConnection) {
    ordersConnection = mongoose.createConnection(MONGODB_URI, { dbName: "orders" });
    ordersConnection.on("connected", () => console.log("Connected to orders DB"));
    ordersConnection.on("error", (err) => console.error("Orders DB error:", err));
    await ordersConnection.asPromise();
  }
  return ordersConnection;
}

export function getOrderModel() {
  if (!ordersConnection) {
    throw new Error("Orders DB not connected. Call connectOrdersDb() first.");
  }
  return ordersConnection.models["Order"] || ordersConnection.model("Order", orderSchema);
}
