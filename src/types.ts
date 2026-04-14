export type RecordStatus =
  | "active"
  | "inactive"
  | "upcoming"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "expired"
  | "completed"
  | "pending";

export interface Product {
  id: string;
  userId: string;
  name: string;
  category: string;
  vendor: string;
  purchaseDate: string;
  purchaseCost: number;
  warrantyExpiry: string;
  serialNumber: string;
  assignedTo: string;
  status: RecordStatus;
  notes: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  name: string;
  provider: string;
  planType: string;
  amount: number;
  billingCycle: "monthly" | "quarterly" | "yearly";
  startDate: string;
  renewalDate: string;
  paymentMethod: string;
  payerName: string;
  payerEmail: string;
  status: RecordStatus;
  reminderDaysBefore: number;
  notes: string;
  createdAt: string;
}

export interface RentRecord {
  id: string;
  userId: string;
  title: string;
  propertyType: string;
  contactName: string;
  payerName: string;
  payerEmail: string;
  rentAmount: number;
  paymentFrequency: "monthly" | "quarterly" | "yearly";
  dueDate: string;
  contractStartDate: string;
  contractEndDate: string;
  status: RecordStatus;
  notes: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  relatedType: "product" | "subscription" | "rent" | "general";
  relatedId: string | null;
  reminderDate: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: RecordStatus;
  message: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  recordType: string;
  recordName: string;
  timestamp: string;
}

export interface User {
  id: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

