export interface Review {
  id: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
}

export interface Vendor {
  id: string;
  name: string;
  phone: string; // WhatsApp number (e.g., "966500000000")
  email?: string; // Vendor's email for login
  commissionRate: number; // e.g., 0.1 for 10%
  userId?: string; // Firebase Auth UID
  mustChangePassword?: boolean; // Force password change on first login
}

export interface Product {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  discountPrice?: number;
  image: string;
  staticImage: string;
  category: 'chocolate_boxes' | 'hospitality_trays' | 'daily_sweets' | 'gift_boxes' | 'occasion_offers';
  categoryImage: string;
  ingredients: string[];
  occasions: string[];
  reviews: Review[];
  vendorId: string;
  vendorUserId?: string;
}

export interface CartItem extends Product {
  quantity: number;
  isGift?: boolean;
  giftMessage?: string;
  giftCardDesign?: string;
}

export interface OrderDetails {
  customerName: string;
  phone: string;
  address: string;
  deliveryType: 'delivery' | 'pickup';
  paymentMethod: 'cash' | 'card';
  preOrderDate?: Date;
  isGift: boolean;
  giftMessage?: string;
  giftCardDesign?: string;
  items: CartItem[];
  total: number;
}
