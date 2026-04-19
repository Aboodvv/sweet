/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, Component } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  Truck, 
  Store, 
  CreditCard, 
  Banknote, 
  Calendar as CalendarIcon,
  ChevronRight,
  X,
  CheckCircle2,
  Star,
  Search,
  Filter,
  Tag,
  PartyPopper,
  Utensils,
  Loader2,
  MessageSquare,
  Share2,
  Copy,
  Check,
  Heart,
  Facebook,
  Instagram,
  Twitter,
  Gift,
  Eye,
  Pencil,
  Lock,
  LogIn,
  KeyRound,
  Upload,
  Image as ImageIcon,
  Settings,
  Landmark,
  Smartphone,
  Wallet
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { products as initialProducts } from './data/products';
import { vendors as initialVendors } from './data/vendors';
import { Product, CartItem, OrderDetails, Review, Vendor, Banner, Category } from './types';
import { cn } from '@/lib/utils';
import { 
  db, 
  auth, 
  storage, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updatePassword as updateAuthPassword
} from './firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  query, 
  orderBy, 
  Timestamp,
  getDocFromServer,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements, PaymentRequestButtonElement } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// --- Error Handling Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, setError?: (info: FirestoreErrorInfo) => void) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (setError) {
    setError(errInfo);
  } else {
    throw new Error(JSON.stringify(errInfo));
  }
}

// --- Stripe Checkout Form Component ---
const CheckoutForm = ({ 
  customerName, setCustomerName, 
  phone, setPhone, 
  address, setAddress, 
  deliveryType, setDeliveryType, 
  paymentMethod, setPaymentMethod, 
  preOrderDate, setPreOrderDate, 
  isGift, setIsGift, 
  giftMessage, setGiftMessage, 
  giftCardDesign, setGiftCardDesign, 
  cartTotal, 
  onSuccess,
  isProcessingPayment,
  setIsProcessingPayment,
  bankDetails 
}: any) => {
  const stripe = useStripe();
  const elements = useElements();
  const [paymentRequest, setPaymentRequest] = useState<any>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);

  React.useEffect(() => {
    if (stripe) {
      const pr = stripe.paymentRequest({
        country: 'US', // Fixed to US for Payment Request Button compatibility in some regions
        currency: 'sar',
        total: {
          label: 'إجمالي الطلب',
          amount: Math.round((cartTotal + (deliveryType === 'delivery' ? 15 : 0)) * 100),
        },
        requestPayerName: true,
        requestPayerPhone: true,
      });

      pr.canMakePayment().then(result => {
        if (result) {
          setPaymentRequest(pr);
        }
      });

      pr.on('paymentmethod', async (ev) => {
        setIsProcessingPayment(true);
        setStripeError(null);
        try {
          const response = await fetch('/api/create-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: cartTotal + (deliveryType === 'delivery' ? 15 : 0) }),
          });
          const data = await response.json();
          
          if (data.error) throw new Error(data.error);

          const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(
            data.clientSecret,
            { payment_method: ev.paymentMethod.id },
            { handleActions: false }
          );

          if (confirmError) {
            ev.complete('fail');
            throw new Error(confirmError.message);
          } else {
            ev.complete('success');
            if (paymentIntent.status === "requires_action") {
              const { error: actionError } = await stripe.confirmCardPayment(data.clientSecret);
              if (actionError) throw new Error(actionError.message);
            }
            onSuccess();
          }
        } catch (err: any) {
          setStripeError(err.message);
        } finally {
          setIsProcessingPayment(false);
        }
      });
    }
  }, [stripe, cartTotal, deliveryType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStripeError(null);
    
    if (paymentMethod === 'card') {
      if (!stripe || !elements) return;
      setIsProcessingPayment(true);

      try {
        const response = await fetch('/api/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: cartTotal + (deliveryType === 'delivery' ? 15 : 0) }),
        });
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);

        const result = await stripe.confirmCardPayment(data.clientSecret, {
          payment_method: {
            card: elements.getElement(CardElement) as any,
            billing_details: {
              name: customerName,
              phone: phone,
            },
          },
        });

        if (result.error) {
          throw new Error(result.error.message);
        }
      } catch (err: any) {
        setStripeError(err.message);
        setIsProcessingPayment(false);
        return;
      }
      setIsProcessingPayment(false);
    } else if (['stc_pay'].includes(paymentMethod)) {
      // Apple Pay is handled by PaymentRequestButton
      setIsProcessingPayment(true);
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsProcessingPayment(false);
    }

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">الاسم بالكامل</Label>
          <Input 
            id="name" 
            placeholder="أدخل اسمك" 
            required 
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">رقم الجوال</Label>
          <Input 
            id="phone" 
            placeholder="05xxxxxxxx" 
            required 
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>طريقة الاستلام</Label>
        <div className="grid grid-cols-2 gap-4">
          <Button 
            type="button"
            variant={deliveryType === 'delivery' ? 'default' : 'outline'}
            className="h-14 rounded-xl gap-2"
            onClick={() => setDeliveryType('delivery')}
          >
            <Truck className="w-5 h-5" />
            توصيل
          </Button>
          <Button 
            type="button"
            variant={deliveryType === 'pickup' ? 'default' : 'outline'}
            className="h-14 rounded-xl gap-2"
            onClick={() => setDeliveryType('pickup')}
          >
            <Store className="w-5 h-5" />
            استلام من الفرع
          </Button>
        </div>
      </div>

      {deliveryType === 'delivery' && (
        <div className="space-y-2">
          <Label htmlFor="address">عنوان التوصيل</Label>
          <Input 
            id="address" 
            placeholder="الحي، الشارع، رقم المنزل" 
            required 
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>طلب مسبق (اختياري)</Label>
        <Popover>
          <PopoverTrigger
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full h-12 justify-start text-right font-normal rounded-xl",
              !preOrderDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="ml-2 h-4 w-4" />
            {preOrderDate ? format(preOrderDate, "PPP", { locale: ar }) : <span>اختر تاريخ الطلب المسبق</span>}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={preOrderDate}
              onSelect={setPreOrderDate}
              initialFocus
              locale={ar}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label>طريقة الدفع</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Button 
            type="button"
            variant={paymentMethod === 'cash' ? 'default' : 'outline'}
            className="h-14 rounded-xl gap-2 text-xs"
            onClick={() => setPaymentMethod('cash')}
          >
            <Banknote className="w-4 h-4" />
            كاش
          </Button>
          <Button 
            type="button"
            variant={paymentMethod === 'card' ? 'default' : 'outline'}
            className="h-14 rounded-xl gap-2 text-xs"
            onClick={() => setPaymentMethod('card')}
          >
            <CreditCard className="w-4 h-4" />
            بطاقة
          </Button>
          <Button 
            type="button"
            variant={paymentMethod === 'apple_pay' ? 'default' : 'outline'}
            className="h-14 rounded-xl gap-2 text-xs"
            onClick={() => setPaymentMethod('apple_pay')}
          >
            <Smartphone className="w-4 h-4" />
            Apple Pay
          </Button>
          <Button 
            type="button"
            variant={paymentMethod === 'stc_pay' ? 'default' : 'outline'}
            className="h-14 rounded-xl gap-2 text-xs"
            onClick={() => setPaymentMethod('stc_pay')}
          >
            <Wallet className="w-4 h-4" />
            STC Pay
          </Button>
          <Button 
            type="button"
            variant={paymentMethod === 'bank_transfer' ? 'default' : 'outline'}
            className="h-14 rounded-xl gap-2 text-xs"
            onClick={() => setPaymentMethod('bank_transfer')}
          >
            <Landmark className="w-4 h-4" />
            تحويل
          </Button>
        </div>
      </div>

      {paymentMethod === 'card' && (
        <div className="p-4 bg-secondary/5 rounded-2xl border border-input">
          <Label className="mb-2 block">بيانات البطاقة</Label>
          <div className="p-3 bg-white rounded-xl border">
            <CardElement options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
            }} />
          </div>
        </div>
      )}

      {stripeError && (
        <div className="p-3 bg-destructive/10 text-destructive text-xs rounded-xl border border-destructive/20 text-center">
          {stripeError}
        </div>
      )}

      {paymentMethod === 'apple_pay' && (
        <div className="space-y-4">
          {paymentRequest ? (
            <div className="p-4 bg-secondary/5 rounded-2xl border border-input">
              <Label className="mb-4 block text-center font-bold">ادفع بسرعة وأمان</Label>
              <PaymentRequestButtonElement options={{ paymentRequest }} />
            </div>
          ) : (
            <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100 text-center">
              <p className="text-xs text-yellow-800">Apple Pay غير مدعوم على هذا المتصفح أو الجهاز حالياً.</p>
            </div>
          )}
        </div>
      )}

      {paymentMethod === 'bank_transfer' && (
        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-2">
          <p className="text-xs font-bold text-primary">بيانات التحويل البنكي:</p>
          <div className="text-[10px] space-y-1">
            <p>البنك: {bankDetails.bankName}</p>
            <p>الاسم: {bankDetails.accountName}</p>
            <p className="font-mono">IBAN: {bankDetails.iban}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">يرجى إرفاق صورة التحويل عند التواصل عبر الواتساب.</p>
        </div>
      )}

      <div className="space-y-4 border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">هل هذا الطلب هدية؟</Label>
            <p className="text-sm text-muted-foreground">سنقوم بإضافة بطاقة إهداء أنيقة مع طلبك.</p>
          </div>
          <Checkbox 
            checked={isGift} 
            onCheckedChange={(checked) => setIsGift(checked as boolean)}
            className="h-6 w-6 rounded-md"
          />
        </div>

        {isGift && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-2">
              <Label>اختر تصميم البطاقة</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'classic', label: 'كلاسيك', color: 'bg-[#3E2723]' },
                  { id: 'gold', label: 'ذهبي', color: 'bg-[#D4AF37]' },
                  { id: 'floral', label: 'وردي', color: 'bg-[#F5E6E8]' }
                ].map((design) => (
                  <button
                    key={design.id}
                    type="button"
                    onClick={() => setGiftCardDesign(design.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                      giftCardDesign === design.id ? "border-primary bg-primary/5" : "border-transparent bg-secondary/20"
                    )}
                  >
                    <div className={cn("w-full h-8 rounded-md shadow-sm", design.color)} />
                    <span className="text-xs font-bold">{design.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gift-message">رسالة الإهداء</Label>
              <textarea 
                id="gift-message"
                className="w-full min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="اكتب رسالتك هنا..."
                value={giftMessage}
                onChange={e => setGiftMessage(e.target.value)}
              />
            </div>
          </motion.div>
        )}
      </div>

      <Separator />

      <div className="bg-secondary/10 p-4 rounded-xl space-y-2">
        <div className="flex justify-between text-sm">
          <span>قيمة المنتجات:</span>
          <span>{cartTotal} ر.س</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>رسوم التوصيل:</span>
          <span>{deliveryType === 'delivery' ? '15 ر.س' : '0 ر.س'}</span>
        </div>
        <div className="flex justify-between text-lg font-bold text-primary pt-2 border-t">
          <span>الإجمالي النهائي:</span>
          <span>{cartTotal + (deliveryType === 'delivery' ? 15 : 0)} ر.س</span>
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full h-14 text-lg font-bold rounded-xl shadow-lg gap-2"
        disabled={isProcessingPayment}
      >
        {isProcessingPayment ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            جاري معالجة الدفع...
          </>
        ) : (
          'تأكيد الطلب'
        )}
      </Button>
    </form>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [firestoreError, setFirestoreError] = useState<FirestoreErrorInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [addingToCart, setAddingToCart] = useState<Record<string, boolean>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [savedItems, setSavedItems] = useState<Product[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bankDetails, setBankDetails] = useState({ bankName: 'الراجحي', accountName: 'متجر شوكولاتة السعادة', iban: 'SA0000000000000000000000' });
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [lastOrder, setLastOrder] = useState<OrderDetails | null>(null);
  const [isVendorManagerOpen, setIsVendorManagerOpen] = useState(false);
  const [isVendorDashboardOpen, setIsVendorDashboardOpen] = useState(false);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentView, setCurrentView] = useState<'store' | 'vendor-dashboard' | 'delivery-info' | 'admin-settings'>('store');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [bannerImageFile, setBannerImageFile] = useState<File | null>(null);
  const [bannerImagePreview, setBannerImagePreview] = useState<string | null>(null);
  const [categoryImageFile, setCategoryImageFile] = useState<File | null>(null);
  const [categoryImagePreview, setCategoryImagePreview] = useState<string | null>(null);
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [currentVendor, setCurrentVendor] = useState<Vendor | null>(null);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorCommission, setNewVendorCommission] = useState('10');
  const [activeTab, setActiveTab] = useState<'home' | 'orders' | 'profile'>('home');
  
  // Vendor-specific view state
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorSortBy, setVendorSortBy] = useState<'newest' | 'price-asc' | 'price-desc'>('newest');
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<'all' | 'chocolate_boxes' | 'hospitality_trays' | 'daily_sweets' | 'gift_boxes' | 'occasion_offers'>('all');

  // Search and Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'chocolate_boxes' | 'hospitality_trays' | 'daily_sweets' | 'gift_boxes' | 'occasion_offers' | 'discounts'>('all');
  const [selectedOccasion, setSelectedOccasion] = useState<string>('all');
  const [selectedIngredient, setSelectedIngredient] = useState<string>('all');

  // Checkout form state
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'apple_pay' | 'stc_pay' | 'bank_transfer'>('cash');
  const [preOrderDate, setPreOrderDate] = useState<Date | undefined>(undefined);
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [giftCardDesign, setGiftCardDesign] = useState('classic');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Review state
  const [reviewingProduct, setReviewingProduct] = useState<Product | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');

  React.useEffect(() => {
    if (editingProduct) {
      setProductImagePreview(editingProduct.image);
    } else {
      setProductImagePreview(null);
      setProductImageFile(null);
    }
  }, [editingProduct]);

  React.useEffect(() => {
    if (editingBanner) {
      setBannerImagePreview(editingBanner.image);
    } else {
      setBannerImagePreview(null);
      setBannerImageFile(null);
    }
  }, [editingBanner]);

  React.useEffect(() => {
    if (editingCategory) {
      setCategoryImagePreview(editingCategory.image);
    } else {
      setCategoryImagePreview(null);
      setCategoryImageFile(null);
    }
  }, [editingCategory]);

  // Test Firebase Connection
  React.useEffect(() => {
    async function testConnection() {
      try {
        // Use a path that is allowed to be read (vendors is public read)
        // Adding a small timeout to avoid race conditions during init
        await new Promise(resolve => setTimeout(resolve, 1000));
        await getDocFromServer(doc(db, 'vendors', 'connection-test'));
      } catch (error) {
        // Only log to console for the initial connection test to avoid intrusive UI
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('the client is offline')) {
          console.error("Firebase Configuration Error: The client is offline. This usually means the API Key or Project ID is incorrect, or the domain is not authorized.");
        } else if (errorMessage.includes('permission-denied')) {
          console.warn("Connection test: Permission denied (this is expected if the document doesn't exist and rules are strict).");
        } else {
          console.warn("Initial Firebase connection test result:", errorMessage);
        }
      }
    }
    testConnection();
  }, []);

  // Sync Vendors from Firestore
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vId = params.get('v');
    if (vId) setVendorFilter(vId);
  }, []);

  React.useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Check if user is a vendor by UID or Email
        const vendor = vendors.find(v => v.userId === u.uid || (v.email && v.email.toLowerCase() === u.email?.toLowerCase()));
        setCurrentVendor(vendor || null);
        
        // Auto-link UID if email matched but UID wasn't set
        if (vendor && !vendor.userId && u.email) {
          updateDoc(doc(db, 'vendors', vendor.id), { userId: u.uid });
        }
      } else {
        setCurrentVendor(null);
      }
    });

    return () => unsubscribeAuth();
  }, [vendors]);

  React.useEffect(() => {
    if (!isAuthReady) return;

    const path = 'vendors';
    const q = query(collection(db, path));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vendorsList: Vendor[] = [];
      snapshot.forEach((doc) => {
        vendorsList.push({ id: doc.id, ...doc.data() } as Vendor);
      });
      
      if (vendorsList.length > 0) {
        setVendors(vendorsList);
      } else {
        // If Firestore is empty, initialize with default vendors
        setVendors(initialVendors); // Fallback to local data immediately
        initialVendors.forEach(async (v) => {
          try {
            await setDoc(doc(db, 'vendors', v.id), {
              name: v.name,
              phone: v.phone,
              commissionRate: v.commissionRate,
              password: '123456789',
              mustChangePassword: true
            });
          } catch (e) {
            // Silently fail for initial sync if not admin
          }
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path, setFirestoreError);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  React.useEffect(() => {
    if (!isAuthReady) return;

    const path = 'banners';
    const q = query(collection(db, path), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bannersList: Banner[] = [];
      snapshot.forEach((doc) => {
        bannersList.push({ id: doc.id, ...doc.data() } as Banner);
      });
      
      if (bannersList.length > 0) {
        setBanners(bannersList);
      } else {
        const initialBanners: Banner[] = [
          { id: '1', image: 'https://picsum.photos/seed/banner1/800/400', title: 'خصم 20% على بوكسات الشوكولاتة', subtitle: 'استخدم كود: CHOC20', order: 1, location: 'top' },
          { id: '2', image: 'https://picsum.photos/seed/banner2/800/400', title: 'صواني ضيافة ملكية لجميع مناسباتكم', subtitle: 'اطلب الآن', order: 2, location: 'top' },
          { id: '3', image: 'https://picsum.photos/seed/banner3/800/400', title: 'توصيل مجاني للطلبات فوق 200 ريال', subtitle: 'لفترة محدودة', order: 3, location: 'top' },
        ];
        setBanners(initialBanners);
        initialBanners.forEach(async (b) => {
          try { await setDoc(doc(db, 'banners', b.id), b); } catch (e) {}
        });
      }
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  React.useEffect(() => {
    if (!isAuthReady) return;

    const path = 'categories';
    const q = query(collection(db, path), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const categoriesList: Category[] = [];
      snapshot.forEach((doc) => {
        categoriesList.push({ id: doc.id, ...doc.data() } as Category);
      });
      
      if (categoriesList.length > 0) {
        setCategories(categoriesList);
      } else {
        const initialCategories: Category[] = [
          { id: 'chocolate_boxes', name: 'بوكسات', icon: '🍫', image: 'https://picsum.photos/seed/cat1/200/200', order: 1 },
          { id: 'hospitality_trays', name: 'صواني', icon: '🍽️', image: 'https://picsum.photos/seed/cat2/200/200', order: 2 },
          { id: 'daily_sweets', name: 'يومي', icon: '🍰', image: 'https://picsum.photos/seed/cat3/200/200', order: 3 },
          { id: 'gift_boxes', name: 'هدايا', icon: '🎁', image: 'https://picsum.photos/seed/cat4/200/200', order: 4 },
          { id: 'occasion_offers', name: 'عروض', icon: '🎉', image: 'https://picsum.photos/seed/cat5/200/200', order: 5 },
        ];
        setCategories(initialCategories);
        initialCategories.forEach(async (c) => {
          try { await setDoc(doc(db, 'categories', c.id), c); } catch (e) {}
        });
      }
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  React.useEffect(() => {
    if (!isAuthReady) return;

    const path = 'products';
    const q = query(collection(db, path));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productsList: Product[] = [];
      snapshot.forEach((doc) => {
        productsList.push({ id: doc.id, ...doc.data() } as Product);
      });
      
      if (productsList.length > 0) {
        setProducts(productsList);
        setIsLoadingProducts(false);
      } else {
        // Initialize with default products if empty
        setProducts(initialProducts); // Fallback to local data immediately
        initialProducts.forEach(async (p) => {
          try {
            await setDoc(doc(db, 'products', p.id), p);
          } catch (e) {
            // Silently fail
          }
        });
        setIsLoadingProducts(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path, setFirestoreError);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const allOccasions = useMemo(() => {
    const occasions = new Set<string>();
    products.forEach(p => p.occasions.forEach(o => occasions.add(o)));
    return Array.from(occasions);
  }, [products]);

  const allIngredients = useMemo(() => {
    const ingredients = new Set<string>();
    products.forEach(p => p.ingredients.forEach(i => ingredients.add(i)));
    return Array.from(ingredients);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesVendor = !vendorFilter || product.vendorId === vendorFilter;
      const matchesSearch = product.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           product.descriptionAr.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === 'all' || 
                             (selectedCategory === 'discounts' ? !!product.discountPrice : product.category === selectedCategory);
      
      const matchesOccasion = selectedOccasion === 'all' || product.occasions.includes(selectedOccasion);
      const matchesIngredient = selectedIngredient === 'all' || product.ingredients.includes(selectedIngredient);

      return matchesVendor && matchesSearch && matchesCategory && matchesOccasion && matchesIngredient;
    });
  }, [products, searchQuery, selectedCategory, selectedOccasion, selectedIngredient, vendorFilter]);

  const vendorProducts = useMemo(() => {
    if (!vendorFilter) return [];
    
    let result = products.filter(p => p.vendorId === vendorFilter);
    
    // Search
    if (vendorSearchQuery) {
      result = result.filter(p => 
        p.nameAr.toLowerCase().includes(vendorSearchQuery.toLowerCase()) ||
        p.descriptionAr.toLowerCase().includes(vendorSearchQuery.toLowerCase())
      );
    }
    
    // Category
    if (vendorCategoryFilter !== 'all') {
      result = result.filter(p => p.category === vendorCategoryFilter);
    }
    
    // Sort
    if (vendorSortBy === 'price-asc') {
      result.sort((a, b) => (a.discountPrice || a.price) - (b.discountPrice || b.price));
    } else if (vendorSortBy === 'price-desc') {
      result.sort((a, b) => (b.discountPrice || b.price) - (a.discountPrice || a.price));
    } else {
      // newest - assuming higher ID or just original order if no timestamp
      result.reverse();
    }
    
    return result;
  }, [products, vendorFilter, vendorSearchQuery, vendorSortBy, vendorCategoryFilter]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.discountPrice || item.price) * item.quantity, 0);
  }, [cart]);

  const addToCart = (product: Product, quantity: number = 1, giftDetails?: { isGift: boolean, giftMessage: string, giftCardDesign: string }) => {
    setAddingToCart(prev => ({ ...prev, [product.id]: true }));
    
    // Simulate network delay
    setTimeout(() => {
      setCart(prev => {
        // If it has gift details, we treat it as a unique item in the cart
        // to avoid merging different gift messages for the same product
        if (giftDetails?.isGift) {
          return [...prev, { ...product, quantity, ...giftDetails }];
        }

        const existing = prev.find(item => item.id === product.id && !item.isGift);
        if (existing) {
          return prev.map(item => 
            (item.id === product.id && !item.isGift) ? { ...item, quantity: item.quantity + quantity } : item
          );
        }
        return [...prev, { ...product, quantity }];
      });
      setAddingToCart(prev => ({ ...prev, [product.id]: false }));
    }, 600);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i === index) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const toggleSaveItem = (product: Product) => {
    setSavedItems(prev => {
      const isSaved = prev.some(item => item.id === product.id);
      if (isSaved) {
        return prev.filter(item => item.id !== product.id);
      }
      return [...prev, product];
    });
  };

  const handleCheckoutClose = (open: boolean) => {
    if (!open && preOrderDate && !orderSuccess) {
      setShowCloseConfirm(true);
      return;
    }
    setIsCheckoutOpen(open);
  };

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingProduct) return;

    const newReview: Review = {
      id: Math.random().toString(36).substr(2, 9),
      userName: customerName || 'عميل مجهول',
      rating: newRating,
      comment: newComment,
      date: new Date().toISOString().split('T')[0]
    };

    setProducts(prev => prev.map(p => 
      p.id === reviewingProduct.id 
        ? { ...p, reviews: [newReview, ...p.reviews] } 
        : p
    ));

    setNewComment('');
    setNewRating(5);
    setReviewingProduct(null);
  };

  const handleCheckout = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Simulation only for methods not handled by Stripe real integration
    if (['stc_pay'].includes(paymentMethod)) {
      setIsProcessingPayment(true);
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsProcessingPayment(false);
    }

    const orderData = {
      customerName,
      phone,
      address,
      deliveryType,
      paymentMethod,
      preOrderDate: preOrderDate ? Timestamp.fromDate(preOrderDate) : null,
      isGift,
      giftMessage,
      giftCardDesign,
      items: cart.map(item => ({
        id: item.id,
        nameAr: item.nameAr,
        price: item.discountPrice || item.price,
        quantity: item.quantity,
        vendorId: item.vendorId,
        isGift: item.isGift || false,
        giftMessage: item.giftMessage || '',
        giftCardDesign: item.giftCardDesign || ''
      })),
      total: cartTotal,
      createdAt: Timestamp.now()
    };

    try {
      await addDoc(collection(db, 'orders'), orderData);
      
      const order: OrderDetails = {
        customerName,
        phone,
        address,
        deliveryType,
        paymentMethod,
        preOrderDate,
        isGift,
        giftMessage,
        giftCardDesign,
        items: [...cart],
        total: cartTotal
      };

      setLastOrder(order);
      setOrderSuccess(true);
      setCart([]);
      setIsCheckoutOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders', setFirestoreError);
    }
  };

  const saveVendor = async () => {
    if (!newVendorName || !newVendorPhone) return;
    
    // Normalize phone: remove all non-digits
    const cleanPhone = newVendorPhone.replace(/\D/g, '');
    
    const vendorData = {
      name: newVendorName,
      phone: cleanPhone,
      email: newVendorEmail.toLowerCase(),
      commissionRate: parseFloat(newVendorCommission) / 100,
      password: '123456789',
      mustChangePassword: true
    };

    try {
      if (editingVendor) {
        // For updates, we don't necessarily want to reset the password unless specified
        const updateData = {
          name: newVendorName,
          phone: cleanPhone,
          email: newVendorEmail.toLowerCase(),
          commissionRate: parseFloat(newVendorCommission) / 100,
        };
        await updateDoc(doc(db, 'vendors', editingVendor.id), updateData);
        setEditingVendor(null);
      } else {
        await addDoc(collection(db, 'vendors'), vendorData);
        
        // Send welcome WhatsApp message
        const welcomeMessage = getVendorWelcomeMessage(newVendorName, newVendorCommission);
        window.open(`https://wa.me/${newVendorPhone}?text=${welcomeMessage}`, '_blank');
      }

      setNewVendorName('');
      setNewVendorPhone('');
      setNewVendorEmail('');
      setNewVendorCommission('10');
    } catch (error) {
      handleFirestoreError(error, editingVendor ? OperationType.UPDATE : OperationType.CREATE, 'vendors', setFirestoreError);
    }
  };

  const deleteVendor = async (vendorId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا البائع؟')) return;
    try {
      await deleteDoc(doc(db, 'vendors', vendorId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'vendors', setFirestoreError);
    }
  };

  const handleEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setNewVendorName(vendor.name);
    setNewVendorPhone(vendor.phone);
    setNewVendorEmail(vendor.email || '');
    setNewVendorCommission((vendor.commissionRate * 100).toString());
  };

  const claimVendorProfile = async (vendorId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'vendors', vendorId), {
        userId: user.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'vendors', setFirestoreError);
    }
  };

  const cancelEditVendor = () => {
    setEditingVendor(null);
    setNewVendorName('');
    setNewVendorPhone('');
    setNewVendorEmail('');
    setNewVendorCommission('10');
  };

  const handleVendorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Normalize input phone: remove all non-digits
    const cleanInputPhone = loginPhone.replace(/\D/g, '');
    const normalizedInputPhone = cleanInputPhone.startsWith('0') ? cleanInputPhone.substring(1) : cleanInputPhone;

    const vendor = vendors.find(v => {
      // Normalize stored phone: remove all non-digits
      const cleanStoredPhone = v.phone.replace(/\D/g, '');
      const normalizedStoredPhone = cleanStoredPhone.startsWith('0') ? cleanStoredPhone.substring(1) : cleanStoredPhone;
      
      const phoneMatches = cleanStoredPhone === cleanInputPhone || 
                           normalizedStoredPhone === normalizedInputPhone ||
                           cleanStoredPhone.endsWith(normalizedInputPhone) ||
                           cleanInputPhone.endsWith(normalizedStoredPhone);
      
      // Handle missing password field (default to 123456789)
      const storedPassword = (v as any).password || '123456789';
      const passwordMatches = storedPassword === loginPassword;
      
      return phoneMatches && passwordMatches;
    });
    
    if (vendor) {
      // Try to sign in with Firebase Auth to get the UID and satisfy security rules
      const vendorEmail = vendor.email || `${cleanInputPhone}@sweets-store.com`;
      const vendorPassword = loginPassword;

      try {
        await signInWithEmailAndPassword(auth, vendorEmail, vendorPassword);
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          try {
            await createUserWithEmailAndPassword(auth, vendorEmail, vendorPassword);
          } catch (createError: any) {
            console.error("Auth creation failed:", createError);
          }
        } else {
          console.error("Auth login failed:", authError);
        }
      }

      setCurrentVendor(vendor);
      // If password field is missing, it's effectively "must change password"
      const needsPasswordChange = vendor.mustChangePassword !== false && ((vendor as any).password === undefined || vendor.mustChangePassword);
      
      if (needsPasswordChange) {
        setIsChangePasswordOpen(true);
      } else {
        setIsLoginDialogOpen(false);
        setCurrentView('vendor-dashboard');
      }
      setLoginPassword('');
    } else {
      alert('رقم الجوال أو كلمة المرور غير صحيحة');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('كلمات المرور غير متطابقة');
      return;
    }
    if (newPassword.length < 8) {
      alert('كلمة المرور يجب أن تكون 8 خانات على الأقل');
      return;
    }
    if (newPassword === '123456789') {
      alert('الرجاء اختيار كلمة مرور مختلفة عن الكلمة الافتراضية');
      return;
    }

    if (!currentVendor) return;

    try {
      // Update in Auth if logged in
      if (auth.currentUser) {
        await updateAuthPassword(auth.currentUser, newPassword);
      }
      
      await updateDoc(doc(db, 'vendors', currentVendor.id), {
        password: newPassword,
        mustChangePassword: false
      });
      setIsChangePasswordOpen(false);
      setIsLoginDialogOpen(false);
      setCurrentView('vendor-dashboard');
      alert('تم تغيير كلمة المرور بنجاح');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'vendors', setFirestoreError);
    }
  };

  const saveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentVendor) return;

    setIsUploadingImage(true);
    const formData = new FormData(e.currentTarget);
    let imageUrl = formData.get('image') as string;

    try {
      // If a new file is selected, upload it
      if (productImageFile) {
        if (!storage) {
          throw new Error("خدمة رفع الصور غير متوفرة حالياً. يرجى التأكد من إعدادات Firebase.");
        }
        const storageRef = ref(storage, `products/${currentVendor.id}/${Date.now()}_${productImageFile.name}`);
        const uploadResult = await uploadBytes(storageRef, productImageFile);
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      const productData: Product = {
        id: editingProduct?.id || '',
        name: formData.get('nameAr') as string, // Fallback to Arabic name for English field
        nameAr: formData.get('nameAr') as string,
        description: formData.get('descriptionAr') as string, // Fallback to Arabic description
        descriptionAr: formData.get('descriptionAr') as string,
        price: parseFloat(formData.get('price') as string),
        discountPrice: formData.get('discountPrice') ? parseFloat(formData.get('discountPrice') as string) : undefined,
        image: imageUrl,
        staticImage: imageUrl,
        category: formData.get('category') as any,
        categoryImage: imageUrl, // Fallback to product image
        vendorId: currentVendor.id,
        vendorUserId: user?.uid || auth.currentUser?.uid,
        ingredients: (formData.get('ingredients') as string).split(',').map(i => i.trim()).filter(i => i !== ""),
        occasions: (formData.get('occasions') as string).split(',').map(o => o.trim()).filter(o => o !== ""),
        reviews: editingProduct?.reviews || []
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), { ...productData });
        setEditingProduct(null);
      } else {
        const newDoc = doc(collection(db, 'products'));
        await setDoc(newDoc, { ...productData, id: newDoc.id });
      }
      setProductImageFile(null);
      setProductImagePreview(null);
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      handleFirestoreError(error, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products', setFirestoreError);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'products', setFirestoreError);
    }
  };

  const saveBanner = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsUploadingImage(true);
    const formData = new FormData(e.currentTarget);
    let imageUrl = formData.get('image') as string;

    try {
      if (bannerImageFile) {
        const storageRef = ref(storage, `banners/${Date.now()}_${bannerImageFile.name}`);
        const uploadResult = await uploadBytes(storageRef, bannerImageFile);
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      const bannerData: Partial<Banner> = {
        title: formData.get('title') as string,
        subtitle: formData.get('subtitle') as string,
        image: imageUrl,
        order: parseInt(formData.get('order') as string) || 1,
        location: formData.get('location') as 'top' | 'middle' | 'bottom'
      };

      if (editingBanner) {
        await updateDoc(doc(db, 'banners', editingBanner.id), bannerData);
        setEditingBanner(null);
      } else {
        const newDoc = doc(collection(db, 'banners'));
        await setDoc(newDoc, { ...bannerData, id: newDoc.id });
      }
      setBannerImageFile(null);
      setBannerImagePreview(null);
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      handleFirestoreError(error, editingBanner ? OperationType.UPDATE : OperationType.CREATE, 'banners', setFirestoreError);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا البنر؟')) return;
    try {
      await deleteDoc(doc(db, 'banners', bannerId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'banners', setFirestoreError);
    }
  };

  const saveCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsUploadingImage(true);
    const formData = new FormData(e.currentTarget);
    let imageUrl = formData.get('image') as string;

    try {
      if (categoryImageFile) {
        const storageRef = ref(storage, `categories/${Date.now()}_${categoryImageFile.name}`);
        const uploadResult = await uploadBytes(storageRef, categoryImageFile);
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      const categoryData: Partial<Category> = {
        name: formData.get('name') as string,
        icon: formData.get('icon') as string,
        image: imageUrl,
        order: parseInt(formData.get('order') as string) || 1
      };

      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), categoryData);
        setEditingCategory(null);
      } else {
        // Categories usually have fixed IDs in this app, but we allow adding new ones
        const catId = formData.get('id') as string || `cat_${Date.now()}`;
        await setDoc(doc(db, 'categories', catId), { ...categoryData, id: catId });
      }
      setCategoryImageFile(null);
      setCategoryImagePreview(null);
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      handleFirestoreError(error, editingCategory ? OperationType.UPDATE : OperationType.CREATE, 'categories', setFirestoreError);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const getVendorWelcomeMessage = (name: string, commission: string) => {
    let message = `*أهلاً بك ${name} في متجر شوكولاتة السعادة!* 🍫✨\n\n`;
    message += `يسعدنا إبلاغك بأنه تم قبولك كبائع رسمي في منصتنا.\n\n`;
    message += `*تفاصيل الشراكة:*\n`;
    message += `- نسبة عمولة المنصة: ${commission}%\n`;
    message += `- صافي ربحك من كل طلب: ${100 - parseFloat(commission)}%\n\n`;
    message += `ستصلك الطلبات مباشرة عبر هذا الرقم. نتمنى لك تجارة مربحة! 🚀`;
    
    return encodeURIComponent(message);
  };

  const getVendorOrderMessage = (vendor: Vendor, items: CartItem[]) => {
    const vendorTotal = items.reduce((sum, item) => sum + (item.discountPrice || item.price) * item.quantity, 0);
    const commission = vendorTotal * vendor.commissionRate;
    const vendorNet = vendorTotal - commission;

    let message = `*طلب جديد من متجر شوكولاتة السعادة*\n\n`;
    message += `*العميل:* ${customerName}\n`;
    message += `*الجوال:* ${phone}\n`;
    message += `*العنوان:* ${address}\n`;
    message += `*طريقة الاستلام:* ${deliveryType === 'delivery' ? 'توصيل' : 'استلام من الفرع'}\n`;
    message += `*طريقة الدفع:* ${
      paymentMethod === 'cash' ? 'كاش' : 
      paymentMethod === 'card' ? 'بطاقة' : 
      paymentMethod === 'apple_pay' ? 'Apple Pay' : 
      paymentMethod === 'stc_pay' ? 'STC Pay' : 'تحويل بنكي'
    }\n`;
    if (preOrderDate) message += `*تاريخ الطلب المسبق:* ${format(preOrderDate, 'PPP', { locale: ar })}\n`;
    message += `\n*المنتجات:*\n`;
    
    items.forEach(item => {
      message += `- ${item.nameAr} (الكمية: ${item.quantity}) - ${item.discountPrice || item.price} ر.س\n`;
      if (item.isGift) {
        message += `  [هدية: ${item.giftCardDesign}] ${item.giftMessage ? `الرسالة: ${item.giftMessage}` : ''}\n`;
      }
    });

    message += `\n*الإجمالي:* ${vendorTotal} ر.س\n`;
    message += `*عمولة المنصة:* ${commission.toFixed(2)} ر.س\n`;
    message += `*صافي البائع:* ${vendorNet.toFixed(2)} ر.س\n`;
    
    return encodeURIComponent(message);
  };

  const resetOrder = () => {
    setOrderSuccess(false);
    setCustomerName('');
    setPhone('');
    setAddress('');
    setPreOrderDate(undefined);
    setIsGift(false);
    setGiftMessage('');
    setGiftCardDesign('classic');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans pb-20 md:pb-0" dir="rtl">
      {firestoreError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="max-w-md w-full border-red-200 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <X className="w-6 h-6" />
                خطأ في الصلاحيات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                عذراً، ليس لديك الصلاحية الكافية لإتمام هذه العملية ({firestoreError.operationType}).
              </p>
              <div className="bg-red-100/50 p-3 rounded-lg text-[10px] font-mono overflow-auto max-h-32">
                {firestoreError.error}
              </div>
              {!firestoreError.authInfo.userId && (
                <Button className="w-full" onClick={login}>
                  تسجيل الدخول كمسؤول
                </Button>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFirestoreError(null)}>
                إغلاق
              </Button>
              <Button className="flex-1" onClick={() => window.location.reload()}>
                تحديث الصفحة
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
      {/* Hungerstation Style Header */}
      <header className="sticky top-0 z-40 w-full bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3 space-y-3">
          {/* Vendor Filter Info */}
          {vendorFilter && (
            <div className="flex items-center justify-between bg-primary/5 p-3 rounded-xl border border-primary/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold">أنت تتسوق من متجر</p>
                  <p className="font-bold text-primary">{vendors.find(v => v.id === vendorFilter)?.name}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-xl border-green-600 text-green-600 gap-2"
                  onClick={() => {
                    const v = vendors.find(v => v.id === vendorFilter);
                    if (v) window.open(`https://wa.me/${v.phone}`, '_blank');
                  }}
                >
                  <MessageSquare className="w-4 h-4" />
                  تواصل
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="rounded-xl text-destructive"
                  onClick={() => setVendorFilter(null)}
                >
                  <X className="w-4 h-4" />
                  إغلاق
                </Button>
              </div>
            </div>
          )}
          {/* Top Row: Location & Cart */}
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => setCurrentView('delivery-info')}
            >
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <Truck className="w-5 h-5" />
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">التوصيل إلى</p>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-sm">المنزل - الرياض، حي النرجس</span>
                  <Truck className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  <ChevronRight className="w-4 h-4 text-primary" />
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {!user && !currentVendor ? (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="rounded-xl text-xs font-bold text-primary hover:bg-primary/5 gap-2"
                  onClick={() => setIsLoginDialogOpen(true)}
                >
                  <LogIn className="w-4 h-4" />
                  دخول التجار
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  {user && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-xl">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-primary truncate max-w-[80px]">{user.displayName}</span>
                    </div>
                  )}
                  {user && user.email === 'aboodvv20@gmail.com' && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="rounded-xl text-xs font-bold text-primary hover:bg-primary/5 gap-2"
                      onClick={() => setCurrentView('admin-settings')}
                    >
                      <Settings className="w-4 h-4" />
                      الإعدادات
                    </Button>
                  )}
                  {currentVendor && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-accent/5 rounded-xl">
                      <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-accent truncate max-w-[80px]">{currentVendor.name}</span>
                    </div>
                  )}
                  {(user || currentVendor) && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-[10px] text-destructive hover:bg-destructive/5"
                      onClick={() => {
                        if (user) auth.signOut();
                        setCurrentVendor(null);
                        setCurrentView('store');
                      }}
                    >
                      خروج
                    </Button>
                  )}
                </div>
              )}
              {currentVendor && (
                <Button 
                  variant={currentView === 'vendor-dashboard' ? 'default' : 'outline'} 
                  size="sm" 
                  className="rounded-xl text-xs font-bold gap-2"
                  onClick={() => setCurrentView(currentView === 'store' ? 'vendor-dashboard' : 'store')}
                >
                  <Store className="w-4 h-4" />
                  {currentView === 'store' ? 'لوحة البائع' : 'العودة للمتجر'}
                </Button>
              )}
              {user?.email === 'aboodvv20@gmail.com' && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="rounded-full relative"
                  onClick={() => setIsVendorManagerOpen(true)}
                >
                  <Store className="w-6 h-6 text-primary" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                className="rounded-full relative"
                onClick={() => setIsSavedOpen(true)}
              >
                <Heart className={cn("w-6 h-6 text-primary", savedItems.length > 0 && "fill-primary")} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="rounded-full relative"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingBag className="w-6 h-6 text-primary" />
                {cart.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 bg-accent text-accent-foreground border-2 border-white px-1.5 py-0.5 text-[10px] min-w-[18px] h-[18px] flex items-center justify-center">
                    {cart.reduce((s, i) => s + i.quantity, 0)}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input 
              className="pr-12 h-12 rounded-xl border-none bg-[#F1F3F4] focus:bg-white transition-colors shadow-none"
              placeholder="ابحث عن شوكولاتة، صواني، أو هدايا..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-8">
        {currentView === 'delivery-info' ? (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full"
                onClick={() => setCurrentView('store')}
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
              <h2 className="text-2xl font-bold">معلومات التوصيل</h2>
            </div>
            
            <Card className="rounded-3xl border-none shadow-sm overflow-hidden">
              <CardContent className="p-12 flex flex-col items-center text-center space-y-6">
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                  <Truck className="w-12 h-12" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">سيتم تنفيذ هذا القسم قريباً</h3>
                  <p className="text-muted-foreground max-w-xs mx-auto">
                    نحن نعمل على تطوير نظام تتبع الطلبات ومعلومات التوصيل المتقدمة.
                  </p>
                </div>
                <Button 
                  className="rounded-xl px-8"
                  onClick={() => setCurrentView('store')}
                >
                  العودة للتسوق
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : currentView === 'admin-settings' && user?.email === 'aboodvv20@gmail.com' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <Settings className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">إعدادات المتجر</h2>
                  <p className="text-muted-foreground">إدارة البنرات، التصنيفات، والصور</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="rounded-xl h-12"
                onClick={() => setCurrentView('store')}
              >
                العودة للمتجر
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Banner Management */}
              <div className="space-y-6">
                <Card className="rounded-3xl shadow-sm border overflow-hidden">
                  <CardHeader className="bg-secondary/5">
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="w-5 h-5" />
                      إدارة البنرات الإعلانية
                    </CardTitle>
                    <CardDescription>أضف أو عدل البنرات التي تظهر في الصفحة الرئيسية</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <form onSubmit={saveBanner} className="space-y-4 bg-secondary/5 p-4 rounded-2xl">
                      <h4 className="font-bold text-sm">{editingBanner ? 'تعديل بنر' : 'إضافة بنر جديد'}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>العنوان الرئيسي</Label>
                          <Input name="title" defaultValue={editingBanner?.title} required className="rounded-xl" />
                        </div>
                        <div className="space-y-2">
                          <Label>العنوان الفرعي</Label>
                          <Input name="subtitle" defaultValue={editingBanner?.subtitle} required className="rounded-xl" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>الترتيب</Label>
                          <Input name="order" type="number" defaultValue={editingBanner?.order || banners.length + 1} required className="rounded-xl" />
                        </div>
                        <div className="space-y-2">
                          <Label>مكان الظهور</Label>
                          <select 
                            name="location" 
                            defaultValue={editingBanner?.location || 'top'} 
                            className="w-full h-10 px-3 py-2 rounded-xl border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            required
                          >
                            <option value="top">أعلى الصفحة (سلايدر)</option>
                            <option value="middle">وسط الصفحة (بين الأقسام)</option>
                            <option value="bottom">أسفل الصفحة</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>صورة البنر</Label>
                        <div 
                          className={cn(
                            "relative border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/5",
                            bannerImagePreview ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20"
                          )}
                          onClick={() => document.getElementById('banner-image-input')?.click()}
                        >
                          {bannerImagePreview ? (
                            <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden group">
                              <img src={bannerImagePreview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <p className="text-white text-xs font-bold">تغيير الصورة</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-6 h-6 text-muted-foreground" />
                              <p className="text-xs font-bold">اسحب الصورة هنا أو انقر للرفع</p>
                            </>
                          )}
                          <input 
                            id="banner-image-input"
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setBannerImageFile(file);
                                const reader = new FileReader();
                                reader.onload = () => setBannerImagePreview(reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </div>
                        <Input name="image" type="hidden" value={bannerImagePreview || ''} />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1 rounded-xl" disabled={isUploadingImage}>
                          {isUploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingBanner ? 'حفظ التعديلات' : 'إضافة البنر')}
                        </Button>
                        {editingBanner && (
                          <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditingBanner(null)}>إلغاء</Button>
                        )}
                      </div>
                    </form>

                    <div className="space-y-3">
                      <h4 className="font-bold text-sm">البنرات الحالية</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {banners.map(banner => (
                          <div key={banner.id} className="flex items-center justify-between p-3 bg-white border rounded-2xl group">
                            <div className="flex items-center gap-3">
                              <div className="w-20 h-10 rounded-lg overflow-hidden border">
                                <img src={banner.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                              <div>
                                <p className="text-xs font-bold">{banner.title}</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-[10px] text-muted-foreground">{banner.subtitle}</p>
                                  <span className="text-[8px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-bold">
                                    {banner.location === 'top' ? 'أعلى' : banner.location === 'middle' ? 'وسط' : 'أسفل'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setEditingBanner(banner)}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-destructive" onClick={() => deleteBanner(banner.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Category Management */}
              <div className="space-y-6">
                <Card className="rounded-3xl shadow-sm border overflow-hidden">
                  <CardHeader className="bg-secondary/5">
                    <CardTitle className="flex items-center gap-2">
                      <Tag className="w-5 h-5" />
                      إدارة التصنيفات
                    </CardTitle>
                    <CardDescription>عدل صور وعناوين التصنيفات في المتجر</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <form onSubmit={saveCategory} className="space-y-4 bg-secondary/5 p-4 rounded-2xl">
                      <h4 className="font-bold text-sm">{editingCategory ? 'تعديل تصنيف' : 'إضافة تصنيف جديد'}</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>اسم التصنيف</Label>
                          <Input name="name" defaultValue={editingCategory?.name} required className="rounded-xl" />
                        </div>
                        <div className="space-y-2">
                          <Label>الأيقونة (Emoji)</Label>
                          <Input name="icon" defaultValue={editingCategory?.icon} required className="rounded-xl" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>الترتيب</Label>
                        <Input name="order" type="number" defaultValue={editingCategory?.order || categories.length + 1} required className="rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label>صورة التصنيف</Label>
                        <div 
                          className={cn(
                            "relative border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/5",
                            categoryImagePreview ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20"
                          )}
                          onClick={() => document.getElementById('category-image-input')?.click()}
                        >
                          {categoryImagePreview ? (
                            <div className="relative w-24 h-24 rounded-xl overflow-hidden group">
                              <img src={categoryImagePreview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <p className="text-white text-[10px] font-bold text-center">تغيير</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-6 h-6 text-muted-foreground" />
                              <p className="text-xs font-bold">انقر للرفع</p>
                            </>
                          )}
                          <input 
                            id="category-image-input"
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setCategoryImageFile(file);
                                const reader = new FileReader();
                                reader.onload = () => setCategoryImagePreview(reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </div>
                        <Input name="image" type="hidden" value={categoryImagePreview || ''} />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1 rounded-xl" disabled={isUploadingImage}>
                          {isUploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingCategory ? 'حفظ التعديلات' : 'إضافة التصنيف')}
                        </Button>
                        {editingCategory && (
                          <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditingCategory(null)}>إلغاء</Button>
                        )}
                      </div>
                    </form>

                    <div className="space-y-3">
                      <h4 className="font-bold text-sm">التصنيفات الحالية</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {categories.map(cat => (
                          <div key={cat.id} className="flex items-center justify-between p-3 bg-white border rounded-2xl group">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg overflow-hidden border">
                                <img src={cat.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                              <div>
                                <p className="text-xs font-bold">{cat.icon} {cat.name}</p>
                                <p className="text-[10px] text-muted-foreground">ID: {cat.id}</p>
                              </div>
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setEditingCategory(cat)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Bank Details Management */}
              <div className="lg:col-span-2">
                <Card className="rounded-3xl shadow-sm border overflow-hidden">
                  <CardHeader className="bg-secondary/5">
                    <CardTitle className="flex items-center gap-2">
                      <Landmark className="w-5 h-5" />
                      إعدادات الدفع والتحويل
                    </CardTitle>
                    <CardDescription>إدارة بيانات الحساب البنكي للتحويلات</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>اسم البنك</Label>
                        <Input 
                          value={bankDetails.bankName} 
                          onChange={e => setBankDetails({...bankDetails, bankName: e.target.value})}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>اسم صاحب الحساب</Label>
                        <Input 
                          value={bankDetails.accountName} 
                          onChange={e => setBankDetails({...bankDetails, accountName: e.target.value})}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>رقم الآيبان (IBAN)</Label>
                        <Input 
                          value={bankDetails.iban} 
                          onChange={e => setBankDetails({...bankDetails, iban: e.target.value})}
                          className="rounded-xl font-mono"
                        />
                      </div>
                    </div>
                    <div className="mt-4 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="font-bold text-blue-800">تنبيه بخصوص Apple Pay و STC Pay:</p>
                        <p className="text-blue-700">يتم حالياً محاكاة عملية الدفع عبر هذه الوسائل. لربطها ببوابة دفع حقيقية (مثل Moyasar أو Stripe)، يرجى تزويدنا بمفاتيح الربط البرمجية (API Keys).</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        ) : currentView === 'vendor-dashboard' && currentVendor ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <Store className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">لوحة تحكم البائع</h2>
                  <p className="text-muted-foreground">{currentVendor.name}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="rounded-xl gap-2 h-12"
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?v=${currentVendor.id}`;
                    navigator.clipboard.writeText(url);
                    alert('تم نسخ رابط متجرك!');
                  }}
                >
                  <Share2 className="w-5 h-5" />
                  رابط متجري للعملاء
                </Button>
                <Button 
                  variant="outline" 
                  className="rounded-xl gap-2 h-12 border-green-600 text-green-600"
                  onClick={() => window.open(`https://wa.me/${currentVendor.phone}`, '_blank')}
                >
                  <MessageSquare className="w-5 h-5" />
                  رقم الواتساب المسجل
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Add/Edit Product Form */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-white p-6 rounded-3xl shadow-sm border space-y-4">
                  <h4 className="font-bold text-lg flex items-center gap-2">
                    {editingProduct ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    {editingProduct ? 'تعديل منتج' : 'إضافة منتج جديد'}
                  </h4>
                  <form onSubmit={saveProduct} className="space-y-4">
                    <div className="space-y-2">
                      <Label>اسم المنتج (بالعربي)</Label>
                      <Input name="nameAr" defaultValue={editingProduct?.nameAr} required className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>وصف المنتج</Label>
                      <textarea 
                        name="descriptionAr" 
                        defaultValue={editingProduct?.descriptionAr}
                        className="w-full min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>السعر</Label>
                        <Input name="price" type="number" step="0.01" defaultValue={editingProduct?.price} required className="rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label>سعر الخصم</Label>
                        <Input name="discountPrice" type="number" step="0.01" defaultValue={editingProduct?.discountPrice} className="rounded-xl" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center justify-between">
                        صورة المنتج
                        {!storage && <span className="text-[10px] text-amber-600 font-bold">⚠️ خدمة الرفع غير مفعلة</span>}
                      </Label>
                      <div 
                        className={cn(
                          "relative border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/5",
                          productImagePreview ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20"
                        )}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const file = e.dataTransfer.files?.[0];
                          if (file && file.type.startsWith('image/')) {
                            setProductImageFile(file);
                            const reader = new FileReader();
                            reader.onload = () => setProductImagePreview(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                        onClick={() => document.getElementById('product-image-input')?.click()}
                      >
                        {productImagePreview ? (
                          <div className="relative w-full aspect-video rounded-xl overflow-hidden group">
                            <img src={productImagePreview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <p className="text-white text-xs font-bold">تغيير الصورة</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center text-muted-foreground">
                              <Upload className="w-6 h-6" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-bold">اسحب الصورة هنا أو انقر للرفع</p>
                              <p className="text-[10px] text-muted-foreground">يدعم: JPG, PNG, WebP</p>
                            </div>
                          </>
                        )}
                        <input 
                          id="product-image-input"
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setProductImageFile(file);
                              const reader = new FileReader();
                              reader.onload = () => setProductImagePreview(reader.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        {isUploadingImage && (
                          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                          </div>
                        )}
                      </div>
                      <Input name="image" type={storage ? "hidden" : "text"} value={storage ? (productImagePreview || '') : undefined} defaultValue={!storage ? editingProduct?.image : undefined} placeholder={!storage ? "أدخل رابط الصورة هنا..." : ""} className={cn(!storage && "rounded-xl")} />
                    </div>
                    <div className="space-y-2">
                      <Label>التصنيف</Label>
                      <Select name="category" defaultValue={editingProduct?.category || 'chocolate_boxes'}>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chocolate_boxes">بوكسات شوكولاتة</SelectItem>
                          <SelectItem value="hospitality_trays">صواني ضيافة</SelectItem>
                          <SelectItem value="daily_sweets">حلويات يومية</SelectItem>
                          <SelectItem value="gift_boxes">صناديق هدايا</SelectItem>
                          <SelectItem value="occasion_offers">عروض المناسبات</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>المكونات (مفصولة بفاصلة)</Label>
                      <Input name="ingredients" defaultValue={editingProduct?.ingredients.join(', ')} placeholder="بندق, كراميل, حليب" className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>المناسبات (مفصولة بفاصلة)</Label>
                      <Input name="occasions" defaultValue={editingProduct?.occasions.join(', ')} placeholder="عيد, زواج, تخرج" className="rounded-xl" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button type="submit" className="flex-1 rounded-xl h-12" disabled={isUploadingImage}>
                        {isUploadingImage ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            جاري الحفظ...
                          </>
                        ) : (
                          editingProduct ? 'حفظ التعديلات' : 'إضافة المنتج'
                        )}
                      </Button>
                      {editingProduct && (
                        <Button type="button" variant="outline" className="rounded-xl h-12" onClick={() => setEditingProduct(null)}>إلغاء</Button>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* Vendor Products List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white p-6 rounded-3xl shadow-sm border space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-lg">منتجاتي الحالية</h4>
                    <Badge variant="secondary" className="rounded-lg">
                      {products.filter(p => p.vendorId === currentVendor.id).length} منتج
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {products.filter(p => p.vendorId === currentVendor.id).map(product => (
                      <div key={product.id} className="flex gap-4 p-4 border rounded-2xl items-center group hover:border-primary/50 transition-all bg-secondary/5">
                        <img src={product.image} className="w-20 h-20 object-cover rounded-xl shadow-sm" referrerPolicy="no-referrer" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold truncate">{product.nameAr}</p>
                          <p className="text-sm text-primary font-bold">{product.price} ر.س</p>
                          <Badge variant="outline" className="mt-1 text-[10px] py-0">{product.category}</Badge>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            className="h-9 w-9 p-0 rounded-xl"
                            onClick={() => setEditingProduct(product)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-9 w-9 p-0 rounded-xl text-destructive hover:bg-destructive/10"
                            onClick={() => deleteProduct(product.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {products.filter(p => p.vendorId === currentVendor.id).length === 0 && (
                      <div className="col-span-full py-20 text-center space-y-4">
                        <div className="w-20 h-20 bg-secondary/20 rounded-full flex items-center justify-center mx-auto">
                          <ShoppingBag className="w-10 h-10 text-muted-foreground opacity-20" />
                        </div>
                        <p className="text-muted-foreground">لم تقم بإضافة أي منتجات بعد.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Vendor Header if filtered */}
            {vendorFilter && vendors.find(v => v.id === vendorFilter) && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-6 rounded-3xl shadow-sm border mb-8"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                      <Store className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{vendors.find(v => v.id === vendorFilter)?.name}</h2>
                      <p className="text-muted-foreground">تصفح جميع منتجات هذا المتجر</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="rounded-xl"
                    onClick={() => {
                      setVendorFilter(null);
                      const url = new URL(window.location.href);
                      url.searchParams.delete('v');
                      window.history.pushState({}, '', url);
                    }}
                  >
                    عرض جميع المتاجر
                  </Button>
                </div>

                <Separator className="my-6" />

                <div className="space-y-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        placeholder="ابحث في منتجات المتجر..." 
                        className="pr-10 rounded-xl h-12 bg-secondary/20 border-none"
                        value={vendorSearchQuery}
                        onChange={(e) => setVendorSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Select value={vendorCategoryFilter} onValueChange={(v: any) => setVendorCategoryFilter(v)}>
                        <SelectTrigger className="w-[140px] rounded-xl h-12 bg-secondary/20 border-none">
                          <SelectValue placeholder="التصنيف" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">جميع التصنيفات</SelectItem>
                          <SelectItem value="chocolate_boxes">بوكسات شوكولاتة</SelectItem>
                          <SelectItem value="hospitality_trays">صواني ضيافة</SelectItem>
                          <SelectItem value="daily_sweets">حلويات يومية</SelectItem>
                          <SelectItem value="gift_boxes">صناديق هدايا</SelectItem>
                          <SelectItem value="occasion_offers">عروض المناسبات</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={vendorSortBy} onValueChange={(v: any) => setVendorSortBy(v)}>
                        <SelectTrigger className="w-[140px] rounded-xl h-12 bg-secondary/20 border-none">
                          <SelectValue placeholder="ترتيب حسب" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">الأحدث</SelectItem>
                          <SelectItem value="price-asc">السعر: من الأقل</SelectItem>
                          <SelectItem value="price-desc">السعر: من الأعلى</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {vendorProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <AnimatePresence mode="popLayout">
                        {vendorProducts.map((product) => (
                          <ProductCard 
                            key={product.id} 
                            product={product} 
                            allProducts={products}
                            onAdd={addToCart} 
                            onReview={() => setReviewingProduct(product)}
                            isAdding={addingToCart[product.id]}
                            isSaved={savedItems.some(item => item.id === product.id)}
                            onToggleSave={toggleSaveItem}
                            onQuickView={() => setQuickViewProduct(product)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="py-20 text-center space-y-4">
                      <div className="w-20 h-20 bg-secondary/20 rounded-full flex items-center justify-center mx-auto">
                        <Search className="w-10 h-10 text-muted-foreground opacity-20" />
                      </div>
                      <p className="text-muted-foreground">لم يتم العثور على منتجات تطابق بحثك في هذا المتجر.</p>
                    </div>
                  )}
                </div>
              </motion.section>
            )}

            {/* Banner Carousel */}
        <section className="relative">
          <ScrollArea className="w-full whitespace-nowrap rounded-2xl">
            <div className="flex gap-4 pb-4">
              {banners.filter(b => b.location === 'top' || !b.location).map((banner) => (
                <div 
                  key={banner.id} 
                  className="relative min-w-[300px] md:min-w-[600px] h-[180px] md:h-[250px] rounded-2xl overflow-hidden shadow-md group cursor-pointer"
                >
                  <img 
                    src={banner.image} 
                    alt={banner.title} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-l from-black/70 to-transparent flex flex-col justify-center p-6 text-white">
                    <h3 className="text-xl md:text-3xl font-bold mb-2">{banner.title}</h3>
                    <p className="text-sm md:text-lg opacity-90">{banner.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </section>

        {/* Category Icons */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">الأقسام</h3>
          </div>
          <div className="grid grid-cols-5 gap-2 md:gap-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id as any)}
                className={cn(
                  "flex flex-col items-center gap-2 group",
                  selectedCategory === cat.id ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "w-14 h-14 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-2xl md:text-3xl shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md",
                  selectedCategory === cat.id ? "bg-primary text-white" : "bg-white"
                )}>
                  <img 
                    src={cat.image} 
                    alt={cat.name} 
                    className={cn(
                      "w-full h-full object-cover rounded-2xl",
                      selectedCategory === cat.id ? "opacity-20 absolute" : "opacity-100"
                    )}
                    referrerPolicy="no-referrer"
                  />
                  {selectedCategory === cat.id && <span className="relative z-10">{cat.icon}</span>}
                </div>
                <span className="text-[10px] md:text-xs font-bold">{cat.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Offers Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">عروض حصرية 🔥</h3>
            <Button variant="link" className="text-primary font-bold">عرض الكل</Button>
          </div>
          <ScrollArea className="w-full">
            <div className="flex gap-6 pb-6">
              {products.filter(p => p.discountPrice).map((product) => (
                <div key={product.id} className="min-w-[280px] max-w-[280px]">
                  <ProductCard 
                    product={product} 
                    allProducts={products}
                    onAdd={addToCart} 
                    onReview={() => setReviewingProduct(product)}
                    isAdding={addingToCart[product.id]}
                    isSaved={savedItems.some(item => item.id === product.id)}
                    onToggleSave={toggleSaveItem}
                    onQuickView={() => setQuickViewProduct(product)}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        </section>

        {/* Main Grid Section */}
        {banners.filter(b => b.location === 'middle').length > 0 && (
          <section className="space-y-4">
            {banners.filter(b => b.location === 'middle').map(banner => (
              <div key={banner.id} className="relative w-full h-[150px] md:h-[200px] rounded-3xl overflow-hidden shadow-sm group">
                <img src={banner.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/40 flex flex-col justify-center p-8 text-white">
                  <h3 className="text-xl md:text-2xl font-bold">{banner.title}</h3>
                  <p className="opacity-90">{banner.subtitle}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">جميع المنتجات</h3>
            <div className="flex gap-2">
              <Select value={selectedOccasion} onValueChange={setSelectedOccasion}>
                <SelectTrigger className="h-10 rounded-xl w-[120px] border-none bg-white shadow-sm">
                  <SelectValue placeholder="المناسبة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {allOccasions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoadingProducts ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product) => (
                  <ProductCard 
                    key={product.id} 
                    product={product} 
                    allProducts={products}
                    onAdd={addToCart} 
                    onReview={() => setReviewingProduct(product)}
                    isAdding={addingToCart[product.id]}
                    isSaved={savedItems.some(item => item.id === product.id)}
                    onToggleSave={toggleSaveItem}
                    onQuickView={() => setQuickViewProduct(product)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {banners.filter(b => b.location === 'bottom').length > 0 && (
          <section className="space-y-4">
            {banners.filter(b => b.location === 'bottom').map(banner => (
              <div key={banner.id} className="relative w-full h-[150px] md:h-[200px] rounded-3xl overflow-hidden shadow-sm group">
                <img src={banner.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/40 flex flex-col justify-center p-8 text-white">
                  <h3 className="text-xl md:text-2xl font-bold">{banner.title}</h3>
                  <p className="opacity-90">{banner.subtitle}</p>
                </div>
              </div>
            ))}
          </section>
        )}
          </>
        )}
      </main>

      {/* Quick View Dialog */}
      <Dialog open={!!quickViewProduct} onOpenChange={(open) => !open && setQuickViewProduct(null)}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden rounded-3xl" dir="rtl">
          {quickViewProduct && (
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="relative h-[300px] md:h-full">
                <img 
                  src={quickViewProduct.image} 
                  alt={quickViewProduct.nameAr} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <Badge className="absolute top-4 right-4 bg-white/90 text-primary border-none shadow-sm px-3 py-1 text-sm font-bold backdrop-blur-sm">
                  {quickViewProduct.category === 'chocolate_boxes' ? 'بوكسات' : 
                   quickViewProduct.category === 'hospitality_trays' ? 'صواني' :
                   quickViewProduct.category === 'daily_sweets' ? 'يومي' :
                   quickViewProduct.category === 'gift_boxes' ? 'هدايا' : 'عروض'}
                </Badge>
              </div>
              <div className="p-8 space-y-6 flex flex-col">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold">{quickViewProduct.nameAr}</h2>
                  <div className="flex items-center gap-2">
                    <div className="flex text-accent">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("w-4 h-4", i < Math.round(quickViewProduct.reviews.reduce((a, b) => a + b.rating, 0) / (quickViewProduct.reviews.length || 1)) && "fill-current")} />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">({quickViewProduct.reviews.length} تقييم)</span>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-primary">
                    {quickViewProduct.discountPrice || quickViewProduct.price} ر.س
                  </span>
                  {quickViewProduct.discountPrice && (
                    <span className="text-lg text-muted-foreground line-through">
                      {quickViewProduct.price} ر.س
                    </span>
                  )}
                </div>

                <p className="text-muted-foreground leading-relaxed">
                  {quickViewProduct.descriptionAr}
                </p>

                <div className="space-y-3">
                  <h4 className="font-bold text-sm">المكونات:</h4>
                  <div className="flex flex-wrap gap-2">
                    {quickViewProduct.ingredients.map(i => (
                      <Badge key={i} variant="secondary" className="bg-secondary/50">{i}</Badge>
                    ))}
                  </div>
                </div>

                <div className="mt-auto pt-6 flex gap-4">
                  <Button 
                    className="flex-1 h-14 rounded-2xl text-lg font-bold gap-2"
                    onClick={() => {
                      addToCart(quickViewProduct);
                      setQuickViewProduct(null);
                    }}
                  >
                    <ShoppingBag className="w-5 h-5" />
                    إضافة للسلة
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-14 w-14 rounded-2xl"
                    onClick={() => toggleSaveItem(quickViewProduct)}
                  >
                    <Heart className={cn("w-6 h-6", savedItems.some(i => i.id === quickViewProduct.id) && "fill-primary text-primary")} />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t flex items-center justify-around h-16 md:hidden shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setActiveTab('home')}
          className={cn("flex flex-col items-center gap-1", activeTab === 'home' ? "text-primary" : "text-muted-foreground")}
        >
          <ShoppingBag className={cn("w-6 h-6", activeTab === 'home' && "fill-primary/10")} />
          <span className="text-[10px] font-bold">الرئيسية</span>
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={cn("flex flex-col items-center gap-1", activeTab === 'orders' ? "text-primary" : "text-muted-foreground")}
        >
          <CalendarIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold">طلباتي</span>
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          className={cn("flex flex-col items-center gap-1", activeTab === 'profile' ? "text-primary" : "text-muted-foreground")}
        >
          <Utensils className="w-6 h-6" />
          <span className="text-[10px] font-bold">حسابي</span>
        </button>
      </nav>

      {/* Cart Drawer */}
      <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
        <DialogContent className="sm:max-w-[500px] h-[90vh] flex flex-col p-0 gap-0" dir="rtl">
          <DialogHeader className="p-6 border-b">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-primary" />
              سلة المشتريات
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 p-6">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="w-24 h-24 bg-secondary/20 rounded-full flex items-center justify-center mb-6">
                  <ShoppingBag className="w-12 h-12 text-muted-foreground" />
                </div>
                <h4 className="text-xl font-bold mb-2">السلة فارغة</h4>
                <p className="text-muted-foreground">ابدأ بإضافة بعض الحلويات اللذيذة إلى سلتك!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {cart.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="flex gap-4">
                    <img 
                      src={item.image} 
                      alt={item.nameAr} 
                      className="w-20 h-20 object-cover rounded-lg shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1">
                      <h5 className="font-bold text-lg">{item.nameAr}</h5>
                      {item.isGift && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] h-5 border-primary/20 text-primary bg-primary/5 gap-1">
                            <Gift className="w-3 h-3" />
                            هدية ({item.giftCardDesign === 'classic' ? 'كلاسيك' : item.giftCardDesign === 'gold' ? 'ذهبي' : 'وردي'})
                          </Badge>
                          {item.giftMessage && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              "{item.giftMessage}"
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-primary font-bold">{item.discountPrice || item.price} ر.س</span>
                        {item.discountPrice && (
                          <span className="text-sm text-muted-foreground line-through">{item.price} ر.س</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8 rounded-full"
                          onClick={() => updateQuantity(index, -1)}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="font-bold w-6 text-center">{item.quantity}</span>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-8 w-8 rounded-full"
                          onClick={() => updateQuantity(index, 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeFromCart(index)}
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {cart.length > 0 && (
            <div className="p-6 border-t bg-secondary/5">
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-medium">الإجمالي:</span>
                <span className="text-2xl font-bold text-primary">{cartTotal} ر.س</span>
              </div>
              <Button 
                className="w-full h-14 text-lg font-bold rounded-xl shadow-lg"
                onClick={() => {
                  setIsCartOpen(false);
                  setIsCheckoutOpen(true);
                }}
              >
                إتمام الطلب
                <ChevronRight className="mr-2 w-5 h-5 rotate-180" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent className="sm:max-w-[400px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <PartyPopper className="text-accent w-6 h-6" />
              تذكير بالطلب المسبق
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">لقد قمت بتحديد تاريخ للطلب المسبق. هل أنت متأكد من رغبتك في إغلاق الصفحة دون إكمال الطلب؟</p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => {
              setShowCloseConfirm(false);
              setIsCheckoutOpen(false);
            }}>
              إغلاق على أي حال
            </Button>
            <Button onClick={() => setShowCloseConfirm(false)}>
              العودة لإكمال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!reviewingProduct} onOpenChange={() => setReviewingProduct(null)}>
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">المراجعات والتقييم</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {reviewingProduct && (
              <>
                <div className="flex gap-4 items-center p-4 bg-secondary/10 rounded-2xl">
                  <img src={reviewingProduct.image} className="w-16 h-16 rounded-lg object-cover" alt="" />
                  <div>
                    <h4 className="font-bold">{reviewingProduct.nameAr}</h4>
                    <div className="flex items-center gap-1 text-accent">
                      <Star className="w-4 h-4 fill-current" />
                      <span className="text-sm font-bold">
                        {reviewingProduct.reviews.length > 0 
                          ? (reviewingProduct.reviews.reduce((a, b) => a + b.rating, 0) / reviewingProduct.reviews.length).toFixed(1)
                          : 'لا يوجد تقييم'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h5 className="font-bold">أضف مراجعتك</h5>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button 
                        key={star} 
                        onClick={() => setNewRating(star)}
                        className={cn("p-1 transition-colors", newRating >= star ? "text-accent" : "text-muted-foreground")}
                      >
                        <Star className={cn("w-8 h-8", newRating >= star && "fill-current")} />
                      </button>
                    ))}
                  </div>
                  <Input 
                    placeholder="اكتب تعليقك هنا..." 
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                  />
                  <Button className="w-full" onClick={handleAddReview}>إرسال المراجعة</Button>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h5 className="font-bold">المراجعات السابقة ({reviewingProduct.reviews.length})</h5>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-4">
                      {reviewingProduct.reviews.map(review => (
                        <div key={review.id} className="p-3 border rounded-xl space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-sm">{review.userName}</span>
                            <span className="text-xs text-muted-foreground">{review.date}</span>
                          </div>
                          <div className="flex text-accent">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={cn("w-3 h-3", i < review.rating && "fill-current")} />
                            ))}
                          </div>
                          <p className="text-sm">{review.comment}</p>
                        </div>
                      ))}
                      {reviewingProduct.reviews.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">لا توجد مراجعات بعد. كن أول من يقيم!</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor Login Dialog */}
      <Dialog open={isLoginDialogOpen} onOpenChange={setIsLoginDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <LogIn className="w-6 h-6 text-primary" />
              دخول التجار
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleVendorLogin} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="login-phone">رقم الجوال</Label>
              <Input 
                id="login-phone" 
                placeholder="مثال: 05xxxxxxxx أو 9665xxxxxxxx" 
                value={loginPhone}
                onChange={e => setLoginPhone(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">كلمة المرور</Label>
              <div className="relative">
                <Input 
                  id="login-password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required 
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl text-lg font-bold"
              disabled={vendors.length === 0}
            >
              {vendors.length === 0 ? 'جاري تحميل البيانات...' : 'دخول'}
            </Button>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">هل أنت مسؤول؟ <button type="button" onClick={login} className="text-primary font-bold">دخول المسؤول</button></p>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Force Password Change Dialog */}
      <Dialog open={isChangePasswordOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[400px]" dir="rtl" onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-accent" />
              تغيير كلمة المرور
            </DialogTitle>
          </DialogHeader>
          <div className="bg-accent/10 p-4 rounded-xl mb-4">
            <p className="text-sm text-accent-foreground">لأمان حسابك، يجب عليك تغيير كلمة المرور الافتراضية قبل المتابعة.</p>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <Input 
                id="new-password" 
                type="password" 
                placeholder="8 خانات على الأقل" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input 
                id="confirm-password" 
                type="password" 
                placeholder="أعد كتابة كلمة المرور" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required 
              />
            </div>
            <Button type="submit" className="w-full h-12 rounded-xl text-lg font-bold bg-accent hover:bg-accent/90">تحديث كلمة المرور</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isVendorDashboardOpen} onOpenChange={setIsVendorDashboardOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-6 h-6 text-primary" />
                لوحة تحكم البائع: {currentVendor?.name}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-xl gap-2"
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?v=${currentVendor?.id}`;
                  navigator.clipboard.writeText(url);
                  alert('تم نسخ رابط متجرك!');
                }}
              >
                <Share2 className="w-4 h-4" />
                رابط المتجر
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 py-6">
            {/* Add/Edit Product Form */}
            <div className="space-y-4">
              <h4 className="font-bold text-lg">{editingProduct ? 'تعديل منتج' : 'إضافة منتج جديد'}</h4>
              <form onSubmit={saveProduct} className="space-y-4 bg-secondary/10 p-4 rounded-2xl">
                <div className="space-y-2">
                  <Label>اسم المنتج (بالعربي)</Label>
                  <Input name="nameAr" defaultValue={editingProduct?.nameAr} required />
                </div>
                <div className="space-y-2">
                  <Label>وصف المنتج</Label>
                  <textarea 
                    name="descriptionAr" 
                    defaultValue={editingProduct?.descriptionAr}
                    className="w-full min-h-[80px] rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>السعر</Label>
                    <Input name="price" type="number" step="0.01" defaultValue={editingProduct?.price} required />
                  </div>
                  <div className="space-y-2">
                    <Label>سعر الخصم (اختياري)</Label>
                    <Input name="discountPrice" type="number" step="0.01" defaultValue={editingProduct?.discountPrice} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    صورة المنتج
                    {!storage && <span className="text-[10px] text-amber-600 font-bold">⚠️ خدمة الرفع غير مفعلة</span>}
                  </Label>
                  <div 
                    className={cn(
                      "relative border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-secondary/5",
                      productImagePreview ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20"
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        setProductImageFile(file);
                        const reader = new FileReader();
                        reader.onload = () => setProductImagePreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    onClick={() => document.getElementById('product-image-input-dialog')?.click()}
                  >
                    {productImagePreview ? (
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden group">
                        <img src={productImagePreview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <p className="text-white text-xs font-bold">تغيير الصورة</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-secondary/20 rounded-full flex items-center justify-center text-muted-foreground">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold">اسحب الصورة هنا أو انقر للرفع</p>
                          <p className="text-[10px] text-muted-foreground">يدعم: JPG, PNG, WebP</p>
                        </div>
                      </>
                    )}
                    <input 
                      id="product-image-input-dialog"
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setProductImageFile(file);
                          const reader = new FileReader();
                          reader.onload = () => setProductImagePreview(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    {isUploadingImage && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      </div>
                    )}
                  </div>
                  <Input name="image" type={storage ? "hidden" : "text"} value={storage ? (productImagePreview || '') : undefined} defaultValue={!storage ? editingProduct?.image : undefined} placeholder={!storage ? "أدخل رابط الصورة هنا..." : ""} className={cn(!storage && "rounded-xl")} />
                </div>
                <div className="space-y-2">
                  <Label>التصنيف</Label>
                  <Select name="category" defaultValue={editingProduct?.category || 'chocolate_boxes'}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chocolate_boxes">بوكسات شوكولاتة</SelectItem>
                      <SelectItem value="hospitality_trays">صواني ضيافة</SelectItem>
                      <SelectItem value="daily_sweets">حلويات يومية</SelectItem>
                      <SelectItem value="gift_boxes">صناديق هدايا</SelectItem>
                      <SelectItem value="occasion_offers">عروض المناسبات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>المكونات (مفصولة بفاصلة)</Label>
                  <Input name="ingredients" defaultValue={editingProduct?.ingredients.join(', ')} placeholder="بندق, كراميل, حليب" />
                </div>
                <div className="space-y-2">
                  <Label>المناسبات (مفصولة بفاصلة)</Label>
                  <Input name="occasions" defaultValue={editingProduct?.occasions.join(', ')} placeholder="عيد, زواج, تخرج" />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1 rounded-xl h-12" disabled={isUploadingImage}>
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        جاري الحفظ...
                      </>
                    ) : (
                      editingProduct ? 'حفظ التعديلات' : 'إضافة المنتج'
                    )}
                  </Button>
                  {editingProduct && (
                    <Button type="button" variant="outline" className="rounded-xl h-12" onClick={() => setEditingProduct(null)}>إلغاء</Button>
                  )}
                </div>
              </form>
            </div>

            {/* Vendor Products List */}
            <div className="space-y-4">
              <h4 className="font-bold text-lg">منتجاتي</h4>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {products.filter(p => p.vendorId === currentVendor?.id).map(product => (
                    <div key={product.id} className="flex gap-4 p-3 border rounded-2xl items-center">
                      <img src={product.image} className="w-16 h-16 object-cover rounded-xl" referrerPolicy="no-referrer" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{product.nameAr}</p>
                        <p className="text-sm text-primary font-bold">{product.price} ر.س</p>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 rounded-full text-primary"
                          onClick={() => setEditingProduct(product)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 rounded-full text-destructive"
                          onClick={() => deleteProduct(product.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isVendorManagerOpen} onOpenChange={setIsVendorManagerOpen}>
        <DialogContent className="sm:max-w-[600px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Store className="w-6 h-6 text-primary" />
              إدارة البائعين والعمولات
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="bg-primary/5 p-4 rounded-2xl space-y-4">
              <h4 className="font-bold text-sm">{editingVendor ? 'تعديل بيانات البائع' : 'إضافة بائع جديد (وسيط)'}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input 
                  placeholder="اسم البائع" 
                  value={newVendorName}
                  onChange={e => setNewVendorName(e.target.value)}
                />
                <Input 
                  placeholder="رقم الواتساب (مثال: 9665xxxxxxxx)" 
                  value={newVendorPhone}
                  onChange={e => setNewVendorPhone(e.target.value)}
                />
                <Input 
                  placeholder="البريد الإلكتروني للتاجر (للدخول)" 
                  type="email"
                  value={newVendorEmail}
                  onChange={e => setNewVendorEmail(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Input 
                    type="number"
                    placeholder="العمولة %" 
                    value={newVendorCommission}
                    onChange={e => setNewVendorCommission(e.target.value)}
                  />
                  <span className="text-xs font-bold">%</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 rounded-xl" onClick={saveVendor}>
                  {editingVendor ? 'حفظ التعديلات' : 'إضافة البائع'}
                </Button>
                {editingVendor && (
                  <Button variant="outline" className="rounded-xl" onClick={cancelEditVendor}>إلغاء</Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-sm">البائعين المسجلين</h4>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {vendors.map(v => (
                    <div key={v.id} className="flex items-center justify-between p-4 border rounded-2xl hover:bg-secondary/5 transition-colors">
                      <div className="flex-1">
                        <p className="font-bold">{v.name}</p>
                        <p className="text-xs text-muted-foreground">{v.phone}</p>
                        <Badge variant="secondary" className="mt-1 bg-accent/10 text-accent border-accent/20 text-[10px]">
                          عمولة الوسيط: {v.commissionRate * 100}%
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="h-9 w-9 p-0 rounded-full text-primary hover:bg-primary/10"
                          onClick={() => handleEditVendor(v)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="h-9 w-9 p-0 rounded-full text-destructive hover:bg-destructive/10"
                          onClick={() => deleteVendor(v.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-9 rounded-xl gap-2 border-green-600 text-green-600 hover:bg-green-50"
                          onClick={() => {
                            const message = getVendorWelcomeMessage(v.name, (v.commissionRate * 100).toString());
                            window.open(`https://wa.me/${v.phone}?text=${message}`, '_blank');
                          }}
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span className="hidden sm:inline">رسالة ترحيب</span>
                        </Button>
                        {!v.userId && user && (
                          <Button 
                            size="sm" 
                            variant="secondary"
                            className="h-9 rounded-xl text-[10px]"
                            onClick={() => claimVendorProfile(v.id)}
                          >
                            ربط بحسابي
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Saved Items Dialog */}
      <Dialog open={isSavedOpen} onOpenChange={setIsSavedOpen}>
        <DialogContent className="sm:max-w-[500px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Heart className="w-6 h-6 text-primary fill-primary" />
              قائمة الأمنيات
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[400px] pr-4">
            {savedItems.length === 0 ? (
              <div className="text-center py-12">
                <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">قائمة الأمنيات فارغة حالياً</p>
              </div>
            ) : (
              <div className="space-y-4">
                {savedItems.map((item) => (
                  <div key={item.id} className="flex gap-4 p-3 border rounded-2xl hover:bg-secondary/5 transition-colors group">
                    <img 
                      src={item.image} 
                      alt={item.nameAr} 
                      className="w-20 h-20 object-cover rounded-xl shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1">
                      <h5 className="font-bold">{item.nameAr}</h5>
                      <p className="text-sm text-primary font-bold">{item.discountPrice || item.price} ر.س</p>
                      <div className="flex gap-2 mt-2">
                        <Button 
                          size="sm" 
                          className="h-8 rounded-lg text-xs"
                          onClick={() => {
                            addToCart(item);
                            setIsSavedOpen(false);
                          }}
                        >
                          إضافة للسلة
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 rounded-lg text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => toggleSaveItem(item)}
                        >
                          حذف
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog (Same as before) */}
      <Dialog open={isCheckoutOpen} onOpenChange={handleCheckoutClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">تفاصيل الطلب</DialogTitle>
          </DialogHeader>
          
          <Elements stripe={stripePromise}>
            <CheckoutForm 
              customerName={customerName} setCustomerName={setCustomerName}
              phone={phone} setPhone={setPhone}
              address={address} setAddress={setAddress}
              deliveryType={deliveryType} setDeliveryType={setDeliveryType}
              paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
              preOrderDate={preOrderDate} setPreOrderDate={setPreOrderDate}
              isGift={isGift} setIsGift={setIsGift}
              giftMessage={giftMessage} setGiftMessage={setGiftMessage}
              giftCardDesign={giftCardDesign} setGiftCardDesign={setGiftCardDesign}
              cartTotal={cartTotal}
              onSuccess={() => handleCheckout({ preventDefault: () => {} } as React.FormEvent)}
              isProcessingPayment={isProcessingPayment}
              setIsProcessingPayment={setIsProcessingPayment}
              bankDetails={bankDetails}
            />
          </Elements>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={orderSuccess} onOpenChange={(open) => {
        if (!open) {
          setOrderSuccess(false);
          resetOrder();
        }
      }}>
        <DialogContent className="sm:max-w-[400px] text-center p-12" dir="rtl">
          <div className="flex flex-col items-center gap-6">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600">
              <CheckCircle2 className="w-16 h-16" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-3xl font-bold text-green-600">تم الطلب بنجاح!</DialogTitle>
              <p className="text-muted-foreground">
                {paymentMethod === 'bank_transfer' 
                  ? "تم تسجيل طلبك. يرجى إرسال صورة التحويل البنكي عند التواصل مع البائع عبر الواتساب."
                  : isGift 
                    ? "شكراً لثقتكم بنا. سيتم إرفاق بطاقة الإهداء مع طلبكم والتواصل معكم قريباً لتأكيد الطلب."
                    : "شكراً لثقتكم بنا. سيتم التواصل معكم قريباً لتأكيد الطلب."}
              </p>
            </div>

            {lastOrder && (
              <div className="w-full space-y-4 mt-2">
                <div className="flex items-center gap-2 text-primary font-bold text-sm border-b pb-2">
                  <Store className="w-4 h-4" />
                  <span>إرسال الطلب للبائعين لتجهيزه:</span>
                </div>
                {Array.from(new Set(lastOrder.items.map(item => item.vendorId))).map(vendorId => {
                  const vendor = vendors.find(v => v.id === vendorId);
                  const vendorItems = lastOrder.items.filter(item => item.vendorId === vendorId);
                  if (!vendor) return null;
                  
                  return (
                    <div key={vendorId} className="flex items-center justify-between p-3 bg-secondary/10 rounded-xl border border-secondary/20">
                      <div className="text-right">
                        <p className="font-bold text-xs">{vendor.name}</p>
                        <p className="text-[10px] text-muted-foreground">{vendorItems.length} منتجات</p>
                      </div>
                      <Button 
                        size="sm" 
                        className="h-9 rounded-lg gap-2 bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          const message = getVendorOrderMessage(vendor, vendorItems);
                          window.open(`https://wa.me/${vendor.phone}?text=${message}`, '_blank');
                        }}
                      >
                        <MessageSquare className="w-4 h-4" />
                        إرسال واتساب
                      </Button>
                    </div>
                  );
                })}
                <p className="text-[10px] text-muted-foreground text-right italic">
                  * سيصل الطلب لكل بائع مباشرة مع حساب العمولة الخاصة بك.
                </p>
              </div>
            )}

            <Button 
              className="w-full h-12 rounded-xl" 
              onClick={() => {
                setOrderSuccess(false);
                resetOrder();
              }}
            >
              العودة للمتجر
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer (Same as before) */}
      <footer className="bg-primary text-primary-foreground py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="space-y-4">
              <h4 className="text-2xl font-bold">شوكولاتة السعادة</h4>
              <p className="text-primary-foreground/80 text-right">طازج… كل يوم. نحن نؤمن بأن الجودة والطزاجة هما سر التميز في عالم الشوكولاتة والحلويات الفاخرة.</p>
            </div>
            <div className="space-y-4">
              <h4 className="text-xl font-bold">روابط سريعة</h4>
              <ul className="space-y-2 text-primary-foreground/80">
                <li><a href="#" className="hover:text-accent transition-colors">عن المتجر</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">سياسة التوصيل</a></li>
                <li><a href="#" className="hover:text-accent transition-colors">تواصل معنا</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-xl font-bold">تواصل معنا</h4>
              <p className="text-primary-foreground/80">الرياض، المملكة العربية السعودية</p>
              <p className="text-primary-foreground/80">هاتف: 9200xxxxx</p>
              <div className="flex gap-4 pt-2">
                <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-all">
                  <Facebook className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-all">
                  <Instagram className="w-5 h-5" />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-primary-foreground/10 flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-all">
                  <Twitter className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
          <Separator className="my-8 bg-primary-foreground/20" />
          <div className="text-center text-primary-foreground/60 text-sm">
            &copy; {new Date().getFullYear()} حلويات السعادة. جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>
    </div>
  );
}

function FilterButton({ active, onClick, label, icon, className, activeClassName }: { 
  active: boolean, 
  onClick: () => void, 
  label: string,
  icon?: React.ReactNode,
  className?: string,
  activeClassName?: string
}) {
  return (
    <Button 
      variant={active ? "default" : "outline"}
      className={cn(
        "rounded-full px-6 h-12 transition-all",
        !active && "border-primary/10 hover:bg-primary/5",
        className,
        active && activeClassName
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

function ProductCard({ product, allProducts, onAdd, onReview, isAdding, isSaved, onToggleSave, onQuickView }: { 
  product: Product, 
  allProducts: Product[],
  onAdd: (p: Product, q: number, gift?: { isGift: boolean, giftMessage: string, giftCardDesign: string }) => void, 
  onReview: () => void, 
  isAdding?: boolean, 
  isSaved?: boolean,
  onToggleSave: (p: Product) => void,
  onQuickView: () => void,
  key?: string 
}) {
  const [quantity, setQuantity] = useState(1);
  const [copied, setCopied] = useState(false);
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [giftCardDesign, setGiftCardDesign] = useState('classic');
  
  const shareUrl = `${window.location.origin}?product=${product.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const avgRating = useMemo(() => {
    if (product.reviews.length === 0) return 0;
    return product.reviews.reduce((a, b) => a + b.rating, 0) / product.reviews.length;
  }, [product.reviews]);

  const relatedProducts = useMemo(() => {
    return allProducts
      .filter(p => p.id !== product.id)
      .map(p => {
        let score = 0;
        // Shared ingredients
        p.ingredients.forEach(i => {
          if (product.ingredients.includes(i)) score += 2;
        });
        // Shared occasions
        p.occasions.forEach(o => {
          if (product.occasions.includes(o)) score += 1;
        });
        return { product: p, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => item.product);
  }, [product, allProducts]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden border-none shadow-md rounded-3xl bg-card group h-full flex flex-col">
        <div className="relative h-64 overflow-hidden">
          <img 
            src={product.image} 
            alt={product.nameAr} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <Badge className="bg-white/90 text-primary border-none shadow-sm px-3 py-1 text-sm font-bold backdrop-blur-sm">
              {product.category === 'chocolate_boxes' ? 'بوكسات' : 
               product.category === 'hospitality_trays' ? 'صواني' :
               product.category === 'daily_sweets' ? 'يومي' :
               product.category === 'gift_boxes' ? 'هدايا' : 'عروض'}
            </Badge>
            {product.discountPrice && (
              <Badge className="bg-accent text-accent-foreground border-none shadow-sm px-3 py-1 text-sm font-bold">
                خصم {Math.round((1 - product.discountPrice / product.price) * 100)}%
              </Badge>
            )}
          </div>
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button 
              variant="secondary" 
              className="rounded-full font-bold gap-2 scale-90 group-hover:scale-100 transition-transform"
              onClick={onQuickView}
            >
              <Eye className="w-4 h-4" />
              نظرة سريعة
            </Button>
          </div>
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <Popover>
              <PopoverTrigger
                className={cn(
                  buttonVariants({ variant: "secondary", size: "icon" }),
                  "rounded-full bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white h-9 w-9"
                )}
              >
                <Share2 className="w-4 h-4 text-primary" />
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4" side="bottom" align="start" dir="rtl">
                <div className="space-y-3">
                  <h4 className="font-bold text-sm">مشاركة المنتج</h4>
                  <p className="text-xs text-muted-foreground">شارك رابط هذا المنتج مع أصدقائك وعائلتك.</p>
                  <div className="flex gap-2">
                    <Input 
                      readOnly 
                      value={shareUrl} 
                      className="h-9 text-xs bg-muted/50"
                    />
                    <Button 
                      size="icon" 
                      className="h-9 w-9 shrink-0" 
                      onClick={handleCopy}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button 
              variant="secondary" 
              size="icon" 
              className={cn(
                "rounded-full bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white h-9 w-9 transition-all",
                isSaved && "bg-primary/10"
              )}
              onClick={() => onToggleSave(product)}
            >
              <Heart className={cn("w-4 h-4 text-primary transition-all", isSaved && "fill-primary")} />
            </Button>
          </div>
        </div>
        <CardHeader className="pb-2 flex-1">
          <div className="flex justify-between items-start gap-2">
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold">{product.nameAr}</CardTitle>
              <button 
                onClick={onReview}
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              >
                <div className="flex text-accent">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={cn("w-3.5 h-3.5", i < Math.round(avgRating) && "fill-current")} />
                  ))}
                </div>
                <span className="text-xs font-bold text-muted-foreground">
                  {avgRating > 0 ? `${avgRating.toFixed(1)} (${product.reviews.length})` : 'قيمنا'}
                </span>
              </button>
              {avgRating > 0 && (
                <div className="w-24 h-1.5 bg-secondary/30 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(avgRating / 5) * 100}%` }}
                    className="h-full bg-accent"
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-lg font-bold text-primary whitespace-nowrap">
                {product.discountPrice || product.price} ر.س
              </span>
              {product.discountPrice && (
                <span className="text-xs text-muted-foreground line-through">
                  {product.price} ر.س
                </span>
              )}
            </div>
          </div>
          <CardDescription className="line-clamp-2 text-sm leading-relaxed mt-2">
            {product.descriptionAr}
          </CardDescription>
          
          <div className="flex flex-wrap gap-1 mt-3">
            {product.occasions.slice(0, 2).map(o => (
              <Badge key={o} variant="secondary" className="text-[10px] px-2 py-0 h-5 bg-secondary/30">{o}</Badge>
            ))}
          </div>

          {/* Recent Review Snippet */}
          {product.reviews.length > 0 && (
            <button 
              onClick={onReview}
              className="mt-4 p-2.5 bg-secondary/10 rounded-xl border border-secondary/20 text-right w-full hover:bg-secondary/20 transition-colors group/review"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-primary/70">آخر مراجعة</span>
                <MessageSquare className="w-3 h-3 text-muted-foreground group-hover/review:text-primary transition-colors" />
              </div>
              <p className="text-[11px] line-clamp-1 italic text-muted-foreground leading-relaxed">
                "{product.reviews[0].comment}"
              </p>
            </button>
          )}
          {/* Related Products Section */}
          {relatedProducts.length > 0 && (
            <div className="mt-6 pt-6 border-t border-secondary/10">
              <h5 className="text-xs font-bold text-primary/70 mb-3 px-1">قد يعجبك أيضاً</h5>
              <ScrollArea className="w-full">
                <div className="flex gap-3 pb-4">
                  {relatedProducts.map((rp) => (
                    <div 
                      key={rp.id} 
                      className="min-w-[120px] max-w-[120px] group/item cursor-pointer"
                      onClick={() => {
                        // In a real app we'd navigate, here we just show it's related
                        // For this demo, let's just log it or we could trigger a detail view if we had one
                        console.log("Related product clicked:", rp.nameAr);
                      }}
                    >
                      <div className="relative aspect-square rounded-xl overflow-hidden mb-2">
                        <img 
                          src={rp.image} 
                          alt={rp.nameAr} 
                          className="w-full h-full object-cover transition-transform group-hover/item:scale-110"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center">
                          <Plus className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <h6 className="text-[10px] font-bold line-clamp-1 group-hover/item:text-primary transition-colors">{rp.nameAr}</h6>
                      <p className="text-[10px] text-primary font-bold">{rp.discountPrice || rp.price} ر.س</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardHeader>
        <CardFooter className="pt-4 flex flex-col gap-4">
          {/* Gifting Toggle */}
          <div className="w-full space-y-3 px-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className={cn("w-4 h-4", isGift ? "text-primary" : "text-muted-foreground")} />
                <Label className="text-xs font-bold cursor-pointer" htmlFor={`gift-toggle-${product.id}`}>إضافة تغليف هدايا؟</Label>
              </div>
              <Checkbox 
                id={`gift-toggle-${product.id}`}
                checked={isGift} 
                onCheckedChange={(checked) => setIsGift(checked as boolean)}
                className="h-5 w-5 rounded-md"
              />
            </div>

            <AnimatePresence>
              {isGift && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'classic', label: 'كلاسيك', color: 'bg-[#3E2723]' },
                      { id: 'gold', label: 'ذهبي', color: 'bg-[#D4AF37]' },
                      { id: 'floral', label: 'وردي', color: 'bg-[#F5E6E8]' }
                    ].map((design) => (
                      <button
                        key={design.id}
                        type="button"
                        onClick={() => setGiftCardDesign(design.id)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all",
                          giftCardDesign === design.id ? "border-primary bg-primary/5" : "border-transparent bg-secondary/20"
                        )}
                      >
                        <div className={cn("w-full h-6 rounded shadow-sm", design.color)} />
                        <span className="text-[10px] font-bold">{design.label}</span>
                      </button>
                    ))}
                  </div>
                  <Input 
                    placeholder="اكتب رسالة الإهداء هنا..."
                    className="h-9 text-xs rounded-xl bg-secondary/10 border-none"
                    value={giftMessage}
                    onChange={e => setGiftMessage(e.target.value)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between w-full bg-secondary/20 rounded-xl p-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg"
              onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="font-bold text-sm">{quantity}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg"
              onClick={() => setQuantity(prev => prev + 1)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <Button 
            className="w-full h-12 rounded-2xl font-bold shadow-md hover:shadow-lg transition-all gap-2"
            disabled={isAdding}
            onClick={() => {
              onAdd(product, quantity, isGift ? { isGift, giftMessage, giftCardDesign } : undefined);
              setQuantity(1); // Reset quantity after adding
              if (isGift) {
                setIsGift(false);
                setGiftMessage('');
              }
            }}
          >
            {isAdding ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ShoppingBag className="w-5 h-5" />
            )}
            {isAdding ? 'جاري الإضافة...' : 'إضافة للسلة'}
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
