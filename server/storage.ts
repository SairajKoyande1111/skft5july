import { UserModel } from "./adminDb";
import { getOrderModel } from "./ordersDb";
import { CustomerDbModel } from "./customerDb";
import type {
  User,
  InsertUser,
  OrderRequest,
  InsertOrderRequest,
  Customer,
  InsertCustomer,
  UpdateCustomer,
  CustomerAddress,
  EmbeddedOrder,
} from "@shared/schema";

function toUser(doc: any): User {
  return {
    id: doc._id.toString(),
    username: doc.username,
    password: doc.password,
  };
}

function toCustomer(doc: any): Customer {
  return {
    id: doc._id.toString(),
    phone: doc.phone,
    name: doc.name ?? null,
    email: doc.email ?? null,
    dateOfBirth: doc.dateOfBirth ?? null,
    addresses: (doc.addresses ?? []).map((a: any) => ({
      id: a._id.toString(),
      name: a.name ?? "",
      phone: a.phone ?? "",
      building: a.building ?? "",
      street: a.street ?? "",
      area: a.area ?? "",
      pincode: a.pincode ?? "",
      type: a.type ?? "house",
      label: a.label ?? "Home",
      instructions: a.instructions ?? "",
    })),
    orders: (doc.orders ?? []).map((o: any) => ({
      orderId: o.orderId,
      customerName: o.customerName,
      phone: o.phone,
      deliveryArea: o.deliveryArea,
      address: o.address,
      items: o.items,
      status: o.status ?? "pending",
      notes: o.notes ?? null,
      total: o.total ?? null,
      placedAt: o.placedAt,
      updatedAt: o.updatedAt,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toOrder(doc: any): OrderRequest {
  return {
    id: doc._id.toString(),
    orderId: doc.orderId ?? null,
    customerName: doc.customerName,
    phone: doc.phone,
    deliveryArea: doc.deliveryArea,
    address: doc.address,
    items: doc.items,
    status: doc.status,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt,
    deliveryType: doc.deliveryType ?? null,
    timeslotLabel: doc.timeslotLabel ?? null,
    instantDeliveryCharge: doc.instantDeliveryCharge ?? null,
    coupon: doc.coupon
      ? {
          couponId: doc.coupon.couponId?.toString() ?? null,
          code: doc.coupon.code,
          discountType: doc.coupon.discountType,
          discountValue: doc.coupon.discountValue,
          discountAmount: doc.coupon.discountAmount,
        }
      : null,
    paymentMethod: doc.paymentMethod ?? null,
    superHubId: doc.superHubId?.toString() ?? null,
    subHubId: doc.subHubId?.toString() ?? null,
    subHubName: doc.subHubName ?? null,
  };
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getOrderRequests(): Promise<OrderRequest[]>;
  getOrdersByPhone(phone: string): Promise<OrderRequest[]>;
  getOrderRequest(id: string): Promise<OrderRequest | undefined>;
  createOrderRequest(order: InsertOrderRequest): Promise<OrderRequest>;
  updateOrderRequestStatus(id: string, status: string): Promise<OrderRequest | undefined>;

  getCustomerByPhone(phone: string): Promise<Customer | undefined>;
  createCustomer(data: InsertCustomer): Promise<Customer>;
  upsertCustomer(phone: string, data: Partial<InsertCustomer>): Promise<Customer>;
  updateCustomer(phone: string, updates: UpdateCustomer): Promise<Customer | undefined>;
  addCustomerAddress(phone: string, address: Omit<CustomerAddress, "id">): Promise<Customer | undefined>;
  updateCustomerAddress(phone: string, addrId: string, updates: Partial<Omit<CustomerAddress, "id">>): Promise<Customer | undefined>;
  deleteCustomerAddress(phone: string, addrId: string): Promise<Customer | undefined>;
  getAllCustomers(): Promise<Customer[]>;
  pushOrderToCustomer(phone: string, order: Omit<EmbeddedOrder, "updatedAt">): Promise<void>;
  updateCustomerOrderStatus(phone: string, orderId: string, status: string): Promise<void>;
}

export class MongoStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const doc = await UserModel.findById(id).lean();
    return doc ? toUser(doc) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const doc = await UserModel.findOne({ username }).lean();
    return doc ? toUser(doc) : undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const doc = await UserModel.create(user);
    return toUser(doc);
  }

  async getOrderRequests(): Promise<OrderRequest[]> {
    const docs = await getOrderModel().find().sort({ createdAt: -1 }).lean();
    return docs.map(toOrder);
  }

  async getOrdersByPhone(phone: string): Promise<OrderRequest[]> {
    const docs = await getOrderModel().find({ phone }).sort({ createdAt: -1 }).lean();
    return docs.map(toOrder);
  }

  async getOrderRequest(id: string): Promise<OrderRequest | undefined> {
    try {
      const doc = await getOrderModel().findById(id).lean();
      return doc ? toOrder(doc) : undefined;
    } catch {
      return undefined;
    }
  }

  async createOrderRequest(order: InsertOrderRequest): Promise<OrderRequest> {
    const doc = await getOrderModel().create({
      ...order,
      status: "pending",
      createdAt: new Date(),
    });
    return toOrder(doc);
  }

  async updateOrderRequestStatus(id: string, status: string): Promise<OrderRequest | undefined> {
    try {
      const doc = await getOrderModel().findByIdAndUpdate(id, { status }, { new: true }).lean();
      return doc ? toOrder(doc) : undefined;
    } catch {
      return undefined;
    }
  }

  async getCustomerByPhone(phone: string): Promise<Customer | undefined> {
    const doc = await CustomerDbModel.findOne({ phone }).lean();
    return doc ? toCustomer(doc) : undefined;
  }

  async createCustomer(data: InsertCustomer): Promise<Customer> {
    const doc = await CustomerDbModel.create({ ...data, addresses: [], orders: [], createdAt: new Date(), updatedAt: new Date() });
    return toCustomer(doc);
  }

  async upsertCustomer(phone: string, data: Partial<InsertCustomer>): Promise<Customer> {
    const { phone: _ignored, ...rest } = data as any;
    const doc = await CustomerDbModel.findOneAndUpdate(
      { phone },
      { $set: { ...rest, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), addresses: [], orders: [] } },
      { new: true, upsert: true }
    ).lean();
    return toCustomer(doc);
  }

  async updateCustomer(phone: string, updates: UpdateCustomer): Promise<Customer | undefined> {
    const doc = await CustomerDbModel.findOneAndUpdate(
      { phone },
      { $set: { ...updates, updatedAt: new Date() } },
      { new: true }
    ).lean();
    return doc ? toCustomer(doc) : undefined;
  }

  async addCustomerAddress(phone: string, address: Omit<CustomerAddress, "id">): Promise<Customer | undefined> {
    const doc = await CustomerDbModel.findOneAndUpdate(
      { phone },
      { $push: { addresses: address }, $set: { updatedAt: new Date() } },
      { new: true }
    ).lean();
    return doc ? toCustomer(doc) : undefined;
  }

  async updateCustomerAddress(phone: string, addrId: string, updates: Partial<Omit<CustomerAddress, "id">>): Promise<Customer | undefined> {
    const setFields: Record<string, any> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(updates)) {
      setFields[`addresses.$.${k}`] = v;
    }
    const doc = await CustomerDbModel.findOneAndUpdate(
      { phone, "addresses._id": addrId },
      { $set: setFields },
      { new: true }
    ).lean();
    return doc ? toCustomer(doc) : undefined;
  }

  async deleteCustomerAddress(phone: string, addrId: string): Promise<Customer | undefined> {
    const doc = await CustomerDbModel.findOneAndUpdate(
      { phone },
      { $pull: { addresses: { _id: addrId } }, $set: { updatedAt: new Date() } },
      { new: true }
    ).lean();
    return doc ? toCustomer(doc) : undefined;
  }

  async getAllCustomers(): Promise<Customer[]> {
    const docs = await CustomerDbModel.find().sort({ createdAt: -1 }).lean();
    return docs.map(toCustomer);
  }

  async pushOrderToCustomer(phone: string, order: Omit<EmbeddedOrder, "updatedAt">): Promise<void> {
    try {
      const embeddedOrder = { ...order, updatedAt: new Date() };
      await CustomerDbModel.findOneAndUpdate(
        { phone },
        {
          $push: { orders: embeddedOrder },
          $set: { updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date(), addresses: [] },
        },
        { upsert: true }
      );
    } catch (err) {
      console.error("Failed to push order to customer document:", err);
    }
  }

  async updateCustomerOrderStatus(phone: string, orderId: string, status: string): Promise<void> {
    try {
      await CustomerDbModel.findOneAndUpdate(
        { phone, "orders.orderId": orderId },
        {
          $set: {
            "orders.$.status": status,
            "orders.$.updatedAt": new Date(),
            updatedAt: new Date(),
          },
        }
      );
    } catch (err) {
      console.error("Failed to update customer order status:", err);
    }
  }
}

export const storage = new MongoStorage();
