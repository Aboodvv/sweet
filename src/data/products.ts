import { Product } from '../types';

export const products: Product[] = [
  {
    id: '1',
    name: 'Luxury Chocolate Box (1kg)',
    nameAr: 'بوكس شوكولاتة فاخر (1 كيلو)',
    description: 'A curated selection of our finest handmade chocolates, including pralines and truffles.',
    descriptionAr: 'تشكيلة مختارة من أجود أنواع الشوكولاتة المصنوعة يدوياً، تشمل البرالين والترافل.',
    price: 350,
    discountPrice: 290,
    image: 'https://picsum.photos/seed/chocbox1/600/400',
    staticImage: 'https://picsum.photos/seed/chocbox1-static/600/400',
    category: 'chocolate_boxes',
    categoryImage: 'https://picsum.photos/seed/chocolate-cat/400/400',
    ingredients: ['شوكولاتة داكنة', 'بندق', 'كراميل مملح'],
    occasions: ['هدية', 'احتفال'],
    reviews: [
      { id: 'r1', userName: 'عبدالله', rating: 5, comment: 'جودة الشوكولاتة استثنائية والتغليف راقي جداً.', date: '2024-03-20' }
    ],
    vendorId: 'v1'
  },
  {
    id: '2',
    name: 'Royal Hospitality Tray',
    nameAr: 'صينية الضيافة الملكية',
    description: 'Elegant silver tray filled with assorted chocolates and stuffed dates.',
    descriptionAr: 'صينية فضية أنيقة مليئة بتشكيلة من الشوكولاتة والتمور المحشوة الفاخرة.',
    price: 550,
    image: 'https://picsum.photos/seed/tray1/600/400',
    staticImage: 'https://picsum.photos/seed/tray1-static/600/400',
    category: 'hospitality_trays',
    categoryImage: 'https://picsum.photos/seed/tray-cat/400/400',
    ingredients: ['تمور فاخرة', 'مكسرات محمصة', 'شوكولاتة بالحليب'],
    occasions: ['زواج', 'استقبال'],
    reviews: [],
    vendorId: 'v2'
  },
  {
    id: '3',
    name: 'Daily Fresh Tart',
    nameAr: 'تارت اليوم الطازج',
    description: 'Our signature tart made fresh every morning with seasonal fruits.',
    descriptionAr: 'تارتنا المميز المحضر طازجاً كل صباح مع فواكه الموسم المختارة.',
    price: 180,
    image: 'https://picsum.photos/seed/tart1/600/400',
    staticImage: 'https://picsum.photos/seed/tart1-static/600/400',
    category: 'daily_sweets',
    categoryImage: 'https://picsum.photos/seed/sweets-cat/400/400',
    ingredients: ['فواكه موسمية', 'كريمة باستري', 'عجينة هشة'],
    occasions: ['جمعة عائلية'],
    reviews: [
      { id: 'r2', userName: 'نورة', rating: 5, comment: 'طعم الفواكه طازج جداً والكريمة خفيفة.', date: '2024-03-22' }
    ],
    vendorId: 'v3'
  },
  {
    id: '4',
    name: 'Golden Gift Box',
    nameAr: 'بوكس الهدايا الذهبي',
    description: 'A luxurious gold-foiled box containing a mix of premium sweets.',
    descriptionAr: 'بوكس فاخر بلمسات ذهبية يحتوي على مزيج من الحلويات الفاخرة المختارة.',
    price: 220,
    discountPrice: 195,
    image: 'https://picsum.photos/seed/giftbox1/600/400',
    staticImage: 'https://picsum.photos/seed/giftbox1-static/600/400',
    category: 'gift_boxes',
    categoryImage: 'https://picsum.photos/seed/gift-cat/400/400',
    ingredients: ['شوكولاتة بيضاء', 'فستق حلبي', 'ورد مجفف'],
    occasions: ['تخرج', 'مولود جديد'],
    reviews: [],
    vendorId: 'v1'
  },
  {
    id: '5',
    name: 'Wedding Celebration Set',
    nameAr: 'طقم عروض المناسبات',
    description: 'Comprehensive set for large celebrations, including multiple trays and boxes.',
    descriptionAr: 'طقم متكامل للمناسبات الكبيرة، يشمل صواني متعددة وبوكسات ضيافة متنوعة.',
    price: 1200,
    image: 'https://picsum.photos/seed/wedding1/600/400',
    staticImage: 'https://picsum.photos/seed/wedding1-static/600/400',
    category: 'occasion_offers',
    categoryImage: 'https://picsum.photos/seed/party-cat/400/400',
    ingredients: ['تشكيلة واسعة'],
    occasions: ['زواج', 'حفلة كبيرة'],
    reviews: [],
    vendorId: 'v2'
  },
  {
    id: '6',
    name: 'Dark Chocolate Truffles',
    nameAr: 'ترافل الشوكولاتة الداكنة',
    description: 'Intense dark chocolate truffles dusted with premium cocoa powder.',
    descriptionAr: 'ترافل الشوكولاتة الداكنة الغنية مغطاة بمسحوق الكاكاو الفاخر.',
    price: 150,
    image: 'https://picsum.photos/seed/truffle1/600/400',
    staticImage: 'https://picsum.photos/seed/truffle1-static/600/400',
    category: 'chocolate_boxes',
    categoryImage: 'https://picsum.photos/seed/chocolate-cat/400/400',
    ingredients: ['كاكاو 70%', 'كريمة طازجة'],
    occasions: ['هدية شخصية'],
    reviews: [],
    vendorId: 'v3'
  }
];
