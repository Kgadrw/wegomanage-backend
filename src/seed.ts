import type { ActivityLog, Product, Reminder, RentRecord, Subscription } from "./types.js";

export const seedProducts: Product[] = [
  {
    id: "p1", name: "MacBook Pro 16\"", category: "Laptops", vendor: "Apple", purchaseDate: "2025-09-28",
    purchaseCost: 2499, warrantyExpiry: "2026-10-01", serialNumber: "C02Z1234HKDT", assignedTo: "Sarah Chen",
    status: "active", notes: "Engineering team lead device", createdAt: "2025-09-28",
  },
  {
    id: "p2", name: "Dell UltraSharp 27\" Monitor", category: "Monitors", vendor: "Dell", purchaseDate: "2025-12-27",
    purchaseCost: 649, warrantyExpiry: "2026-12-02", serialNumber: "CN-0J234X-74261", assignedTo: "Mike Johnson",
    status: "active", notes: "4K USB-C monitor", createdAt: "2025-12-27",
  },
  {
    id: "p3", name: "Herman Miller Aeron Chair", category: "Furniture", vendor: "Herman Miller", purchaseDate: "2025-03-27",
    purchaseCost: 1395, warrantyExpiry: "2036-03-27", serialNumber: "AE123456789", assignedTo: "Reception",
    status: "active", notes: "Size B, graphite frame", createdAt: "2025-03-27",
  },
  {
    id: "p4", name: "iPhone 15 Pro", category: "Phones", vendor: "Apple", purchaseDate: "2026-02-10",
    purchaseCost: 999, warrantyExpiry: "2027-02-10", serialNumber: "DNQXK234HG7", assignedTo: "David Park",
    status: "active", notes: "Company phone with MDM", createdAt: "2026-02-10",
  },
  {
    id: "p5", name: "Logitech MX Master 3S", category: "Peripherals", vendor: "Logitech", purchaseDate: "2026-03-13",
    purchaseCost: 99, warrantyExpiry: "2027-03-13", serialNumber: "2218LZ0034", assignedTo: "Lisa Wong",
    status: "active", notes: "Wireless mouse", createdAt: "2026-03-13",
  },
  {
    id: "p6", name: "ThinkPad X1 Carbon Gen 11", category: "Laptops", vendor: "Lenovo", purchaseDate: "2026-01-26",
    purchaseCost: 1849, warrantyExpiry: "2027-01-26", serialNumber: "PF-4K2N8R", assignedTo: "Alex Rivera",
    status: "active", notes: "Finance department", createdAt: "2026-01-26",
  },
];

export const seedSubscriptions: Subscription[] = [
  {
    id: "s1", name: "Slack Business+", provider: "Slack", planType: "Business+", amount: 1250,
    billingCycle: "monthly", startDate: "2025-03-27", renewalDate: "2026-04-11",
    paymentMethod: "Corporate Visa", status: "active", reminderDaysBefore: 7,
    payerName: "", payerEmail: "", notes: "50 seats", createdAt: "2025-03-27",
  },
  {
    id: "s2", name: "AWS Cloud Services", provider: "Amazon", planType: "Enterprise", amount: 4200,
    billingCycle: "monthly", startDate: "2024-03-27", renewalDate: "2026-03-30",
    paymentMethod: "ACH Transfer", status: "active", reminderDaysBefore: 14,
    payerName: "", payerEmail: "", notes: "Production infrastructure", createdAt: "2024-03-27",
  },
  {
    id: "s3", name: "Figma Organization", provider: "Figma", planType: "Organization", amount: 540,
    billingCycle: "yearly", startDate: "2025-06-01", renewalDate: "2026-05-31",
    paymentMethod: "Corporate Amex", status: "active", reminderDaysBefore: 30,
    payerName: "", payerEmail: "", notes: "Design team - 12 editors", createdAt: "2025-06-01",
  },
  {
    id: "s4", name: "GitHub Enterprise", provider: "GitHub", planType: "Enterprise", amount: 1890,
    billingCycle: "monthly", startDate: "2024-11-12", renewalDate: "2026-04-18",
    paymentMethod: "Corporate Visa", status: "active", reminderDaysBefore: 7,
    payerName: "", payerEmail: "", notes: "Unlimited repos, SAML SSO", createdAt: "2024-11-12",
  },
  {
    id: "s5", name: "Notion Team Plan", provider: "Notion", planType: "Team", amount: 800,
    billingCycle: "monthly", startDate: "2025-09-08", renewalDate: "2026-04-04",
    paymentMethod: "Corporate Visa", status: "active", reminderDaysBefore: 5,
    payerName: "", payerEmail: "", notes: "Knowledge base", createdAt: "2025-09-08",
  },
  {
    id: "s6", name: "Adobe Creative Cloud", provider: "Adobe", planType: "All Apps", amount: 4788,
    billingCycle: "yearly", startDate: "2025-05-01", renewalDate: "2026-05-01",
    paymentMethod: "Corporate Amex", status: "active", reminderDaysBefore: 30,
    payerName: "", payerEmail: "", notes: "6 licenses for design team", createdAt: "2025-05-01",
  },
];

export const seedRentRecords: RentRecord[] = [
  {
    id: "r1", title: "Main Office Lease", propertyType: "Office Space", contactName: "Meridian Properties LLC",
    rentAmount: 8500, paymentFrequency: "monthly", dueDate: "2026-04-01",
    contractStartDate: "2025-03-27", contractEndDate: "2027-03-27",
    payerName: "", payerEmail: "", status: "active", notes: "Floor 12, Suite 1200, downtown", createdAt: "2025-03-27",
  },
  {
    id: "r2", title: "Warehouse Storage", propertyType: "Warehouse", contactName: "Metro Storage Solutions",
    rentAmount: 2200, paymentFrequency: "monthly", dueDate: "2026-03-24",
    contractStartDate: "2025-10-28", contractEndDate: "2026-10-01",
    payerName: "", payerEmail: "", status: "overdue", notes: "Unit B, 2000 sqft", createdAt: "2025-10-28",
  },
  {
    id: "r3", title: "Parking Lot Spaces", propertyType: "Parking", contactName: "City Parking Corp",
    rentAmount: 600, paymentFrequency: "monthly", dueDate: "2026-04-08",
    contractStartDate: "2025-12-27", contractEndDate: "2026-12-02",
    payerName: "", payerEmail: "", status: "active", notes: "10 reserved spots", createdAt: "2025-12-27",
  },
  {
    id: "r4", title: "Server Room Co-location", propertyType: "Data Center", contactName: "DataVault Inc",
    rentAmount: 3400, paymentFrequency: "monthly", dueDate: "2026-03-26",
    contractStartDate: "2025-02-20", contractEndDate: "2027-02-15",
    payerName: "", payerEmail: "", status: "overdue", notes: "2 full racks, 10kW power", createdAt: "2025-02-20",
  },
];

export const seedReminders: Reminder[] = [
  {
    id: "rm1", title: "AWS billing review", relatedType: "subscription", relatedId: "s2",
    reminderDate: "2026-03-29", priority: "high", status: "pending",
    message: "Review AWS costs and optimize unused resources", createdAt: "2026-03-22",
  },
  {
    id: "rm2", title: "Office lease renewal discussion", relatedType: "rent", relatedId: "r1",
    reminderDate: "2026-04-02", priority: "medium", status: "pending",
    message: "Schedule meeting with Meridian Properties about renewal terms", createdAt: "2026-03-17",
  },
  {
    id: "rm3", title: "Laptop inventory audit", relatedType: "product", relatedId: null,
    reminderDate: "2026-03-28", priority: "medium", status: "pending",
    message: "Quarterly asset inventory check", createdAt: "2026-03-20",
  },
  {
    id: "rm4", title: "Warehouse payment overdue", relatedType: "rent", relatedId: "r2",
    reminderDate: "2026-03-25", priority: "urgent", status: "overdue",
    message: "Contact Metro Storage about late payment", createdAt: "2026-03-22",
  },
  {
    id: "rm5", title: "Figma license review", relatedType: "subscription", relatedId: "s3",
    reminderDate: "2026-03-31", priority: "low", status: "pending",
    message: "Check if we still need 12 editor seats", createdAt: "2026-03-24",
  },
];

export const seedActivityLog: ActivityLog[] = [
  { id: "a1", action: "created", recordType: "product", recordName: "Logitech MX Master 3S", timestamp: new Date().toISOString() },
];

