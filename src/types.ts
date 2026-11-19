export const PRODUCT_CATEGORIES = [
  'Microcontrollers',
  'Sensors',
  'Modules',
  'Power & Relays',
  'Passive & LEDs',
  'College Kits',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PROJECT_DOMAINS = [
  'IoT & WiFi',
  'Robotics',
  'Embedded',
  'Power & Solar',
  'Sensor Systems',
] as const;

export type ProjectDomain = (typeof PROJECT_DOMAINS)[number];

export const PROJECT_LEVELS = [
  'School / Science',
  'Diploma',
  'BE / B.Tech',
] as const;

export type ProjectLevel = (typeof PROJECT_LEVELS)[number];

export type ImageKey =
  | 'arduino'
  | 'esp32'
  | 'raspberrypi'
  | 'hall_ultrasonic'
  | 'microcontrollers'
  | 'sensors'
  | 'power'
  | 'robotics'
  | 'bench';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type FulfillmentType = 'pickup_kharadi' | 'delivery_pune';
export type PaymentMethod = 'pay_at_shop' | 'cod_pune' | 'upi_on_delivery';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: ProductCategory;
  price: number;
  unit: string;
  stock: number;
  description: string;
  specs: string;
  imageKey: ImageKey;
  imageUrl?: string;
  inStock: boolean;
  featured: boolean;
  lastOrderId?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CollegeProject {
  id: string;
  title: string;
  domain: ProjectDomain;
  level: ProjectLevel;
  summary: string;
  componentsList: string[];
  estimatedPrice: number;
  leadTimeDays: number;
  available: boolean;
  imageKey: ImageKey;
  imageUrl?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
  qty: number;
  imageKey: ImageKey;
  imageUrl?: string;
  isProjectKit?: boolean;
}

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress: string;
  collegeProjectNotes: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  phone: string;
  defaultAddress: string;
  collegeName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InventoryAlertSettings {
  id: 'inventoryAlerts';
  lowStockEmailEnabled: boolean;
  recipientEmail: string;
  lowStockThreshold: number;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// Validation limits synchronized with firebase-blueprint.json & firestore.rules
export const SCHEMA_LIMITS = {
  ID_MAX: 128,
  PRODUCT_NAME_MAX: 120,
  SKU_MAX: 40,
  UNIT_MAX: 32,
  DESCRIPTION_MAX: 600,
  SPECS_MAX: 200,
  IMAGE_URL_MAX: 120000,
  PROJECT_TITLE_MAX: 140,
  PROJECT_BOM_MAX: 12,
  PROJECT_BOM_ITEM_MAX: 80,
  CUSTOMER_NAME_MAX: 100,
  CUSTOMER_PHONE_MAX: 20,
  CUSTOMER_EMAIL_MAX: 120,
  ADDRESS_MAX: 300,
  PROJECT_NOTES_MAX: 500,
  ORDER_ITEMS_MAX: 25,
} as const;

export interface ChatMaterialItem {
  name: string;
  qty: number;
  purpose: string;
  catalogProductId: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  materials?: ChatMaterialItem[];
}

export const ADMIN_EMAIL = 'itzz.nischit@gmail.com';
export const PUNE_DELIVERY_FEE = 60;
export const FREE_DELIVERY_THRESHOLD = 1500;
