import { z } from "zod";

export const recordStatusSchema = z.enum([
  "active",
  "inactive",
  "upcoming",
  "due_soon",
  "due_today",
  "overdue",
  "expired",
  "completed",
  "pending",
]);

export const productSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  vendor: z.string().min(1),
  purchaseDate: z.string().min(1),
  purchaseCost: z.number(),
  warrantyExpiry: z.string().min(1),
  serialNumber: z.string().min(1),
  assignedTo: z.string().min(1),
  status: recordStatusSchema,
  notes: z.string().default(""),
  createdAt: z.string().min(1),
});

export const productCreateSchema = productSchema.omit({ id: true, createdAt: true, userId: true });
export const productUpdateSchema = productCreateSchema.partial();

export const subscriptionSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  planType: z.string().min(1),
  amount: z.number(),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]),
  startDate: z.string().min(1),
  renewalDate: z.string().min(1),
  paymentMethod: z.string().min(1),
  payerName: z.string().trim().default(""),
  payerEmail: z.string().trim().email().or(z.literal("")).default(""),
  status: recordStatusSchema,
  reminderDaysBefore: z.number().int(),
  notes: z.string().default(""),
  createdAt: z.string().min(1),
});

export const subscriptionCreateSchema = subscriptionSchema.omit({ id: true, createdAt: true, userId: true });
export const subscriptionUpdateSchema = subscriptionCreateSchema.partial();

export const rentRecordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1),
  propertyType: z.string().min(1),
  contactName: z.string().min(1),
  payerName: z.string().trim().default(""),
  payerEmail: z.string().trim().email().or(z.literal("")).default(""),
  rentAmount: z.number(),
  paymentFrequency: z.enum(["monthly", "quarterly", "yearly"]),
  dueDate: z.string().min(1),
  contractStartDate: z.string().min(1),
  contractEndDate: z.string().min(1),
  status: recordStatusSchema,
  notes: z.string().default(""),
  createdAt: z.string().min(1),
});

export const rentRecordCreateSchema = rentRecordSchema.omit({ id: true, createdAt: true, userId: true });
export const rentRecordUpdateSchema = rentRecordCreateSchema.partial();

export const reminderSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1),
  relatedType: z.enum(["product", "subscription", "rent", "general"]),
  relatedId: z.string().nullable(),
  reminderDate: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: recordStatusSchema,
  message: z.string().default(""),
  createdAt: z.string().min(1),
});

export const reminderCreateSchema = reminderSchema.omit({ id: true, createdAt: true, userId: true });
export const reminderUpdateSchema = reminderCreateSchema.partial();

