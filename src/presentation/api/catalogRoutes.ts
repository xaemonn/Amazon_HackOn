import express, { Router, type Request, type Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

// ─── Catalog Data ────────────────────────────────────────────────────────────

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  emoji: string;
  images: string[];
  description: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
  badge?: string;
  originalPrice?: number;
  imageUrl?: string;
}

const U = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=80`;

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  {
    id: 'item-grade-a',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    category: 'Electronics',
    price: 24990,
    originalPrice: 29990,
    currency: 'INR',
    emoji: '🎧',
    images: [
      U('1505740420928-5e560c06d30e'),
      U('1484704849700-f032a568e944'),
      U('1546435770-a3e426bf472b'),
      U('1583394838336-acd977736f90'),
    ],
    description: 'Industry-leading noise cancellation with 30-hour battery life. LDAC support, multipoint Bluetooth connection, and speak-to-chat technology. Premium leather cushions fold flat for travel.',
    rating: 4.5,
    reviewCount: 2847,
    inStock: true,
    badge: 'Best Seller',
    tags: ['wireless', 'noise-cancellation', 'ldac', 'premium', 'sony'],
  },
  {
    id: 'item-grade-b',
    name: 'JBL Flip 6 Portable Bluetooth Speaker',
    category: 'Electronics',
    price: 7999,
    originalPrice: 9999,
    currency: 'INR',
    emoji: '🔊',
    images: [
      U('1608043152269-423dbba4e7e1'),
      U('1545454675-3531b543be5d'),
      U('1558618047-3c8c76ca7d13'),
    ],
    description: 'Powerful sound with bold bass. IP67 waterproof and dustproof, 12-hour playtime, and PartyBoost for linking multiple speakers. Perfect for outdoor adventures.',
    rating: 4.4,
    reviewCount: 1593,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['jbl', 'portable', 'waterproof', 'ip67', 'bass'],
  },
  {
    id: 'item-grade-c',
    name: 'Samsung Galaxy S24 5G',
    category: 'Electronics',
    price: 74999,
    originalPrice: 79999,
    currency: 'INR',
    emoji: '📱',
    images: [
      U('1511707171634-5f897ff02aa9'),
      U('1592899677977-9c10ca588bbd'),
      U('1580910051074-3eb694886505'),
      U('1601784551446-20c9e07cdbdb'),
    ],
    description: '6.2-inch Dynamic AMOLED display, Snapdragon 8 Gen 3 processor, 50MP triple camera system with 30x Space Zoom. 25W fast charging, IP68 water resistance, and 7 years of OS updates.',
    rating: 4.6,
    reviewCount: 4210,
    inStock: true,
    badge: 'New Launch',
    tags: ['5g', 'amoled', 'snapdragon', 'samsung', '50mp'],
  },
  {
    id: 'item-grade-d',
    name: 'boAt Bassheads 900 Wired Earphones',
    category: 'Electronics',
    price: 699,
    originalPrice: 1299,
    currency: 'INR',
    emoji: '🎵',
    images: [
      U('1484704849700-f032a568e944'),
      U('1631176093557-5ee45a5a7073'),
      U('1505740420928-5e560c06d30e'),
    ],
    description: 'HD sound with 10mm drivers, tangle-free braided cable, and in-line mic for calls. Ergonomic ear tips for all-day comfort. Compatible with all 3.5mm devices.',
    rating: 4.1,
    reviewCount: 8932,
    inStock: true,
    tags: ['wired', 'earphones', 'boat', 'bass', 'mic'],
  },
  {
    id: 'nutella-750g',
    name: 'Nutella Hazelnut Chocolate Spread 750g',
    category: 'Food & Grocery',
    price: 499,
    originalPrice: 560,
    currency: 'INR',
    emoji: '🍫',
    images: [
      U('1571771894821-ce9b6c11b08e'),
      U('1558618666-fcd25c85cd64'),
      U('1576618148400-f54bed99fcfd'),
    ],
    description: 'The original Ferrero Nutella — a unique recipe with over 50 hazelnuts per jar. No artificial colours or preservatives. Perfect on toast, pancakes, waffles, or straight from the spoon!',
    rating: 4.8,
    reviewCount: 12400,
    inStock: true,
    badge: 'Best Seller',
    tags: ['nutella', 'chocolate', 'hazelnut', 'spread', 'ferrero'],
  },
  {
    id: 'myfitness-pb-1kg',
    name: 'MyFitness Original Peanut Butter Crunchy 1kg',
    category: 'Food & Grocery',
    price: 469,
    originalPrice: 599,
    currency: 'INR',
    emoji: '🥜',
    images: [
      U('1600271886742-f049cd451bba'),
      U('1559181567-c3190ca9d5c5'),
      U('1543591080-0c3eb61d4f41'),
    ],
    description: 'Made from 100% roasted peanuts with no added sugar, palm oil, or preservatives. High protein (25g per serving), naturally gluten-free. Crunchy texture for that perfect bite.',
    rating: 4.5,
    reviewCount: 6730,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['peanut-butter', 'protein', 'no-sugar', 'crunchy', 'healthy'],
  },
  {
    id: 'headshoulders-650ml',
    name: "Head & Shoulders Smooth & Silky Shampoo 650ml",
    category: 'Beauty & Personal Care',
    price: 449,
    originalPrice: 549,
    currency: 'INR',
    emoji: '🧴',
    images: [
      U('1556228720-195a672e8a03'),
      U('1571781926291-c477ebfd024b'),
      U('1585232354509-e6e6844a43c7'),
    ],
    description: 'Clinically proven anti-dandruff protection with up to 100% dandruff-free hair. Pyrithione Zinc formula strengthens hair from root to tip. Leaves hair smooth, silky, and beautifully fragrant.',
    rating: 4.3,
    reviewCount: 9812,
    inStock: true,
    tags: ['shampoo', 'anti-dandruff', 'head-shoulders', 'hair-care'],
  },
  {
    id: 'dove-bodywash-500ml',
    name: 'Dove Deep Moisture Body Wash 500ml',
    category: 'Beauty & Personal Care',
    price: 329,
    originalPrice: 399,
    currency: 'INR',
    emoji: '🛁',
    images: [
      U('1607006344380-f6e9d4d17e14'),
      U('1556228453-efd6c1ff04f6'),
      U('1584467541268-b040f83be3fd'),
    ],
    description: 'Dove NutriumMoisture technology nourishes skin with essential nutrients. Softer, smoother skin after just one shower. Dermatologist recommended, pH-balanced, and hypoallergenic.',
    rating: 4.4,
    reviewCount: 5241,
    inStock: true,
    tags: ['body-wash', 'dove', 'moisturising', 'skin-care'],
  },
  {
    id: 'smart-watch-pro',
    name: 'Noise ColorFit Pro 5 Smart Watch',
    category: 'Electronics',
    price: 4999,
    originalPrice: 8999,
    currency: 'INR',
    emoji: '⌚',
    images: [
      U('1523275335684-37898b6baf30'),
      U('1508685096489-7aacd43bd3b1'),
      U('1546868871-0f936769f3ad'),
      U('1559825481-12a05cc00344'),
    ],
    description: '1.85-inch AMOLED display, 100+ sports modes, 24/7 heart rate & SpO2 monitoring, sleep tracking, and GPS. 7-day battery life. Compatible with Android and iOS. IP68 water resistant.',
    rating: 4.3,
    reviewCount: 3187,
    inStock: true,
    badge: 'Best Seller',
    tags: ['smartwatch', 'amoled', 'fitness', 'gps', 'health-tracking'],
  },
  {
    id: 'running-shoes-xt',
    name: 'Nike Air Max 270 Running Shoes',
    category: 'Footwear',
    price: 8495,
    originalPrice: 10995,
    currency: 'INR',
    emoji: '👟',
    images: [
      U('1542291026-7eec264c27ff'),
      U('1608231387042-66d1773d3028'),
      U('1491553895911-0055eca6402d'),
      U('1600185365926-3a2ce3cdb9eb'),
    ],
    description: "Nike's largest Air unit yet delivers all-day comfort. Lightweight mesh upper for breathability, foam midsole for cushioning, and rubber outsole for durability. Available in multiple colourways.",
    rating: 4.5,
    reviewCount: 2934,
    inStock: true,
    tags: ['nike', 'air-max', 'running', 'cushioned', 'breathable'],
  },
  {
    id: 'travel-backpack-40l',
    name: 'American Tourister Travel Backpack 40L',
    category: 'Bags',
    price: 3499,
    originalPrice: 4999,
    currency: 'INR',
    emoji: '🎒',
    images: [
      U('1553062407-98eeb64c6a62'),
      U('1622260614153-03223fb72052'),
      U('1473188537798-3e69f7d8b671'),
      U('1502810365585-56ffa361fdde'),
    ],
    description: 'TSA-approved 40L expandable backpack with dedicated 17-inch padded laptop sleeve. Integrated USB-A charging port, hidden anti-theft pocket, and water-resistant coating.',
    rating: 4.4,
    reviewCount: 1876,
    inStock: true,
    tags: ['backpack', 'travel', 'laptop', 'tsa', 'usb-charging'],
  },
  {
    id: 'mech-keyboard-tkl',
    name: 'Keychron K8 Wireless Mechanical Keyboard',
    category: 'Electronics',
    price: 6999,
    originalPrice: 7999,
    currency: 'INR',
    emoji: '⌨️',
    images: [
      U('1587829741301-dc798b83add3'),
      U('1541140032-f0076a9d7fe3'),
      U('1614436163996-25cee5f54290'),
    ],
    description: 'Tenkeyless layout with Bluetooth 5.1 + USB-C wired mode. Gateron G Pro switches (Red/Brown/Blue options), 3-level white backlight, aluminium frame, and Mac/Windows compatibility.',
    rating: 4.7,
    reviewCount: 1254,
    inStock: true,
    badge: 'Top Rated',
    tags: ['mechanical', 'wireless', 'keychron', 'tkl', 'bluetooth'],
  },
  {
    id: 'mamaearth-vitamin-c',
    name: 'Mamaearth Vitamin C Face Serum 30ml',
    category: 'Beauty & Personal Care',
    price: 449,
    originalPrice: 599,
    currency: 'INR',
    emoji: '✨',
    images: [
      U('1621576015534-28b10b00b2a1'),
      U('1556228453-efd6c1ff04f6'),
      U('1571781926291-c477ebfd024b'),
    ],
    description: 'Powered by Vitamin C & Turmeric, this serum fades dark spots, brightens skin tone, and boosts collagen production. Dermatologist tested, toxin-free, made safe certified. Suitable for all skin types.',
    rating: 4.2,
    reviewCount: 7342,
    inStock: true,
    tags: ['vitamin-c', 'serum', 'mamaearth', 'brightening', 'anti-dark-spot'],
  },
  {
    id: 'whey-protein-1kg',
    name: 'MuscleBlaze Whey Protein 1kg (Chocolate)',
    category: 'Health & Sports',
    price: 1699,
    originalPrice: 2299,
    currency: 'INR',
    emoji: '💪',
    images: [
      U('1571019614242-c5c5dee9f50b'),
      U('1534438327276-14e5300c3a48'),
      U('1544367567-0f2fcb009e0b'),
    ],
    description: '25g protein per serving with 5.5g BCAA. Cold-processed whey protein concentrate for superior taste and mixability. Available in Chocolate, Vanilla, and Strawberry. 30 servings per pack.',
    rating: 4.4,
    reviewCount: 11200,
    inStock: true,
    badge: 'Best Seller',
    tags: ['whey-protein', 'bcaa', 'muscleblaze', 'chocolate', 'gym'],
  },
  {
    id: 'instant-pot-6qt',
    name: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker 6Qt',
    category: 'Home & Kitchen',
    price: 7499,
    originalPrice: 10999,
    currency: 'INR',
    emoji: '🍲',
    images: [
      U('1585515320310-259814833e62'),
      U('1556909114-f6e7ad7d3136'),
      U('1567620905732-2d1ec7ab7445'),
    ],
    description: 'Pressure cooker, slow cooker, rice cooker, yogurt maker, steamer, sauté pan, and food warmer — 7 appliances in one. 13 one-touch programs, delay start, and keep-warm functions. Dishwasher-safe inner pot.',
    rating: 4.7,
    reviewCount: 3890,
    inStock: true,
    tags: ['pressure-cooker', 'instant-pot', 'kitchen', '7-in-1', 'slow-cooker'],
  },
  {
    id: 'item-earbuds',
    name: 'Apple AirPods Pro (2nd Gen)',
    category: 'Electronics',
    price: 24900,
    originalPrice: 26900,
    currency: 'INR',
    emoji: '🎧',
    images: [
      U('1588423771073-b8903fabad74'),
      U('1600294037681-c80b4cb5b434'),
    ],
    description: 'Active Noise Cancellation, Transparency mode, Adaptive Audio. Up to 6 hours listening time, 30 hours total with case. H2 chip, personalized Spatial Audio with head tracking.',
    rating: 4.8,
    reviewCount: 6540,
    inStock: true,
    badge: 'Apple Certified',
    tags: ['audio', 'wireless', 'earbuds', 'apple', 'anc'],
    imageUrl: '/api/catalog/images/item-earbuds',
  },

  // ── Fashion ────────────────────────────────────────────────────────────────
  {
    id: 'levis-511-jeans',
    name: "Levi's 511 Slim Fit Jeans",
    category: 'Fashion',
    price: 2499,
    originalPrice: 3499,
    currency: 'INR',
    emoji: '👖',
    images: [
      U('1542272604-787c3835535d'),
      U('1541099649105-f69ad21f3246'),
      U('1475178626620-a4d074967452'),
    ],
    description: "Levi's 511 Slim Fit jeans sit below the waist and are slim from hip to ankle. Made with a touch of stretch for all-day comfort. Classic 5-pocket styling in authentic denim.",
    rating: 4.5,
    reviewCount: 8921,
    inStock: true,
    badge: 'Top Rated',
    tags: ['levis', 'jeans', 'slim-fit', 'denim', 'fashion'],
  },
  {
    id: 'zara-oversized-tee',
    name: 'Zara Oversized Cotton T-Shirt',
    category: 'Fashion',
    price: 1290,
    originalPrice: 1590,
    currency: 'INR',
    emoji: '👕',
    images: [
      U('1521572163474-6864f9cf17ab'),
      U('1503341504251-83f2d776de2a'),
      U('1618354691373-d851c5c3a990'),
    ],
    description: 'Relaxed oversized fit with a round neck. Made from 100% premium combed cotton. Garment-dyed for a faded vintage finish. Perfect for casual layering.',
    rating: 4.3,
    reviewCount: 4312,
    inStock: true,
    tags: ['zara', 't-shirt', 'oversized', 'cotton', 'unisex'],
  },
  {
    id: 'hm-linen-shirt',
    name: 'H&M Relaxed Linen Blend Shirt',
    category: 'Fashion',
    price: 1799,
    originalPrice: 2299,
    currency: 'INR',
    emoji: '👔',
    images: [
      U('1598032895455-5e48b2c8d6ef'),
      U('1516762689617-e1cffcef479d'),
      U('1594938298603-2d1d5a1b1d1e'),
    ],
    description: 'Made from a linen-cotton blend for a lightweight summer feel. Regular fit with a classic collar and chest pocket. Machine washable. Available in 8 colours.',
    rating: 4.2,
    reviewCount: 2876,
    inStock: true,
    tags: ['h&m', 'linen', 'shirt', 'summer', 'casual'],
  },
  {
    id: 'puma-sports-shorts',
    name: 'Puma Drycell Active Sports Shorts',
    category: 'Fashion',
    price: 1299,
    originalPrice: 1799,
    currency: 'INR',
    emoji: '🩳',
    images: [
      U('1534438327276-14e5300c3a48'),
      U('1517836357463-d25dfeac3438'),
      U('1611915387288-fd8d2f5f928b'),
    ],
    description: 'PUMA Drycell technology keeps you dry and comfortable during intense workouts. Elastic waistband with inner drawstring. Side pockets. 4-way stretch fabric.',
    rating: 4.4,
    reviewCount: 3201,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['puma', 'shorts', 'sports', 'drycell', 'activewear'],
  },
  {
    id: 'allen-solly-formal',
    name: 'Allen Solly Slim Fit Formal Shirt',
    category: 'Fashion',
    price: 1099,
    originalPrice: 1799,
    currency: 'INR',
    emoji: '👔',
    images: [
      U('1507003211169-0a1dd7228f2d'),
      U('1598032895455-5e48b2c8d6ef'),
      U('1578768079052-aa76e52ff9ea'),
    ],
    description: 'Premium cotton slim-fit formal shirt with a spread collar. Wrinkle-resistant finish. Perfect for office wear or smart casual occasions. Available in 12 colour options.',
    rating: 4.3,
    reviewCount: 5674,
    inStock: true,
    tags: ['allen-solly', 'formal', 'shirt', 'slim-fit', 'office'],
  },

  // ── Footwear ───────────────────────────────────────────────────────────────
  {
    id: 'adidas-ultraboost-22',
    name: 'Adidas Ultraboost 22 Running Shoes',
    category: 'Footwear',
    price: 12999,
    originalPrice: 17999,
    currency: 'INR',
    emoji: '👟',
    images: [
      U('1606107557195-0e29a4b5b4aa'),
      U('1542291026-7eec264c27ff'),
      U('1491553895911-0055eca6402d'),
    ],
    description: "Adidas' most cushioned running shoe. BOOST midsole for energy return, Primeknit+ upper for a sock-like fit. Continental rubber outsole for grip on wet surfaces. Great for long runs.",
    rating: 4.7,
    reviewCount: 5832,
    inStock: true,
    badge: 'Best Seller',
    tags: ['adidas', 'ultraboost', 'running', 'boost', 'primeknit'],
  },
  {
    id: 'puma-suede-classic',
    name: 'Puma Suede Classic XXI Sneakers',
    category: 'Footwear',
    price: 4999,
    originalPrice: 6499,
    currency: 'INR',
    emoji: '👟',
    images: [
      U('1608231387042-66d1773d3028'),
      U('1584735175315-9d5df23be907'),
      U('1600185365926-3a2ce3cdb9eb'),
    ],
    description: 'The iconic Puma Suede celebrates 50+ years of streetwear culture. Suede upper, formstrip detailing, and SoftFoam+ sockliner for cushioned comfort. Timeless design for everyday wear.',
    rating: 4.5,
    reviewCount: 3476,
    inStock: true,
    tags: ['puma', 'suede', 'sneakers', 'streetwear', 'classic'],
  },
  {
    id: 'bata-casual-loafer',
    name: 'Bata Comfit Slip-On Loafer',
    category: 'Footwear',
    price: 1299,
    originalPrice: 1999,
    currency: 'INR',
    emoji: '👞',
    images: [
      U('1533867522198-a7d98b49882c'),
      U('1445363692815-ebcd599f7621'),
      U('1516478177764-9fe5bd7e9717'),
    ],
    description: 'Comfit memory foam insole for all-day comfort. Breathable PU upper with elastic gore panels for easy slip-on. Flexible TPR outsole with anti-slip tread pattern.',
    rating: 4.2,
    reviewCount: 7890,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['bata', 'loafer', 'slip-on', 'comfort', 'casual'],
  },

  // ── Home & Kitchen ─────────────────────────────────────────────────────────
  {
    id: 'philips-air-fryer-4l',
    name: 'Philips NA231/00 4L Digital Air Fryer',
    category: 'Home & Kitchen',
    price: 8495,
    originalPrice: 12995,
    currency: 'INR',
    emoji: '🍟',
    images: [
      U('1585515320310-259814833e62'),
      U('1600803907087-f56d462fd26b'),
      U('1567620905732-2d1ec7ab7445'),
    ],
    description: 'Up to 90% less fat than traditional frying. Rapid Air technology circulates hot air for crispy results. Digital touchscreen, 7 cooking presets, and a non-stick drawer that is dishwasher safe.',
    rating: 4.6,
    reviewCount: 12400,
    inStock: true,
    badge: 'Best Seller',
    tags: ['philips', 'air-fryer', 'healthy', 'digital', 'non-stick'],
  },
  {
    id: 'prestige-kettle-electric',
    name: 'Prestige PKOSS 1.5L Electric Kettle',
    category: 'Home & Kitchen',
    price: 799,
    originalPrice: 1299,
    currency: 'INR',
    emoji: '🫖',
    images: [
      U('1556909114-f6e7ad7d3136'),
      U('1622483820013-b31fcaa94a56'),
      U('1519494026892-476b3d78ea20'),
    ],
    description: '1500W powerful heating. Auto shut-off with boil-dry protection. 1.5L capacity with wide mouth for easy cleaning. 360° cordless base. Stainless steel body with cool-touch handle.',
    rating: 4.3,
    reviewCount: 18700,
    inStock: true,
    tags: ['prestige', 'kettle', 'electric', '1500w', 'stainless'],
  },
  {
    id: 'milton-flask-thermosteel',
    name: 'Milton Thermosteel Flip Lid Flask 1L',
    category: 'Home & Kitchen',
    price: 699,
    originalPrice: 999,
    currency: 'INR',
    emoji: '🧃',
    images: [
      U('1544145945-b74e7cb3d3f6'),
      U('1571019613454-1cb2f99b2d8b'),
      U('1622483820013-b31fcaa94a56'),
    ],
    description: '18/8 stainless steel double-walled vacuum insulation. Keeps hot 24 hrs, cold 36 hrs. Flip lid with locking mechanism. BPA-free and food-grade safe. Leak-proof when locked.',
    rating: 4.5,
    reviewCount: 34200,
    inStock: true,
    badge: 'Top Rated',
    tags: ['milton', 'flask', 'thermosteel', 'vacuum', 'insulated'],
  },
  {
    id: 'bosch-hand-blender',
    name: 'Bosch ErgoMixx Hand Blender 700W',
    category: 'Home & Kitchen',
    price: 3499,
    originalPrice: 4999,
    currency: 'INR',
    emoji: '🥣',
    images: [
      U('1558618666-fcd25c85cd64'),
      U('1585232354509-e6e6844a43c7'),
      U('1573246123716-6b1782bfd66f'),
    ],
    description: '700W motor with 12 speed settings and turbo function. EasyClick tool change system — blade, whisk & chopper included. Ergonomic soft-grip handle. Dishwasher-safe attachments.',
    rating: 4.4,
    reviewCount: 2341,
    inStock: true,
    tags: ['bosch', 'blender', 'hand-blender', '700w', 'ergonomic'],
  },
  {
    id: 'wonderchef-non-stick',
    name: 'Wonderchef Granite Non-Stick Tawa 28cm',
    category: 'Home & Kitchen',
    price: 999,
    originalPrice: 1599,
    currency: 'INR',
    emoji: '🍳',
    images: [
      U('1574781330837-9b0b35b0246f'),
      U('1556909114-f6e7ad7d3136'),
      U('1585515320310-259814833e62'),
    ],
    description: 'Triple-layer granite non-stick coating for healthy cooking with minimal oil. Compatible with all stovetops including induction. Stay-cool Bakelite handle. PFOA-free, food grade safe.',
    rating: 4.3,
    reviewCount: 9870,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['wonderchef', 'tawa', 'non-stick', 'granite', 'induction'],
  },

  // ── Electronics (more) ────────────────────────────────────────────────────
  {
    id: 'logitech-mx-master3',
    name: 'Logitech MX Master 3S Wireless Mouse',
    category: 'Electronics',
    price: 8495,
    originalPrice: 9995,
    currency: 'INR',
    emoji: '🖱️',
    images: [
      U('1563986768609-322da13575f3'),
      U('1587829741301-dc798b83add3'),
      U('1496181133206-80ce9b88a853'),
    ],
    description: 'Advanced 8K DPI sensor, quiet MagSpeed electromagnetic scroll wheel, and 7 customizable buttons. Ergonomic sculpted design. Up to 70 days on a full charge. Works on glass surfaces.',
    rating: 4.8,
    reviewCount: 4231,
    inStock: true,
    badge: 'Top Rated',
    tags: ['logitech', 'mouse', 'wireless', 'ergonomic', 'mx-master'],
  },
  {
    id: 'samsung-galaxy-tab-s9',
    name: 'Samsung Galaxy Tab S9 FE 10.9" Tablet',
    category: 'Electronics',
    price: 34999,
    originalPrice: 41999,
    currency: 'INR',
    emoji: '📱',
    images: [
      U('1544244015-0df4b3ffc6b0'),
      U('1611532736597-de2d4265fba3'),
      U('1580910051074-3eb694886505'),
    ],
    description: '10.9-inch TFT display, Exynos 1380 processor, 6GB RAM + 128GB storage. IP68 water resistant, S Pen included. 8000mAh battery, 45W Super Fast Charging. Samsung DeX support.',
    rating: 4.5,
    reviewCount: 2198,
    inStock: true,
    badge: 'New Launch',
    tags: ['samsung', 'tablet', 's-pen', 'ip68', 'dex'],
  },
  {
    id: 'wd-1tb-ssd',
    name: 'WD My Passport 1TB Portable SSD',
    category: 'Electronics',
    price: 6999,
    originalPrice: 9499,
    currency: 'INR',
    emoji: '💾',
    images: [
      U('1629654297299-c8506221ca97'),
      U('1597872200969-2b65d56bd16b'),
      U('1498049794561-7780e7231661'),
    ],
    description: 'NVMe speeds up to 1050 MB/s read. USB-C 3.2 Gen 2 connection. Hardware encryption with password protection. Shockproof, drop-proof up to 2m. Works with Mac, PC, and PS5.',
    rating: 4.6,
    reviewCount: 3541,
    inStock: true,
    badge: 'Best Seller',
    tags: ['wd', 'ssd', 'portable', 'nvme', 'usb-c'],
  },
  {
    id: 'mi-11-lite',
    name: 'Xiaomi 14 Civi 5G Smartphone',
    category: 'Electronics',
    price: 29999,
    originalPrice: 33999,
    currency: 'INR',
    emoji: '📱',
    images: [
      U('1592899677977-9c10ca588bbd'),
      U('1511707171634-5f897ff02aa9'),
      U('1601784551446-20c9e07cdbdb'),
    ],
    description: 'Snapdragon 8s Gen 3, 50MP triple camera with optical image stabilisation, 4700mAh battery with 67W turbo charging. 6.55-inch AMOLED 144Hz display. Lightweight design at 171g.',
    rating: 4.4,
    reviewCount: 3762,
    inStock: true,
    tags: ['xiaomi', '5g', 'amoled', 'snapdragon', '50mp'],
  },
  {
    id: 'hp-laptop-15s',
    name: 'HP 15s Intel Core i5 Laptop (8GB / 512GB SSD)',
    category: 'Electronics',
    price: 52990,
    originalPrice: 62990,
    currency: 'INR',
    emoji: '💻',
    images: [
      U('1496181133206-80ce9b88a853'),
      U('1517336714731-489689fd1ca8'),
      U('1585771724684-38269d6639fd'),
    ],
    description: '12th Gen Intel Core i5 processor, 8GB DDR4 RAM, 512GB NVMe SSD. 15.6-inch FHD IPS anti-glare display. Intel Iris Xe Graphics. Backlit keyboard, Windows 11 Home. 10.5-hour battery.',
    rating: 4.4,
    reviewCount: 5670,
    inStock: true,
    badge: 'Best Seller',
    tags: ['hp', 'laptop', 'i5', 'ssd', 'windows-11'],
  },

  // ── Books ──────────────────────────────────────────────────────────────────
  {
    id: 'atomic-habits-book',
    name: 'Atomic Habits — James Clear (Paperback)',
    category: 'Books',
    price: 499,
    originalPrice: 799,
    currency: 'INR',
    emoji: '📘',
    images: [
      U('1544947950-fa07a98d237f'),
      U('1512820790803-83ca734da794'),
      U('1495446815901-a7297e633e8d'),
    ],
    description: "The #1 New York Times bestseller. A proven framework for improving every day. James Clear distills the most fundamental information about habit formation into practical strategies. Over 10 million copies sold.",
    rating: 4.9,
    reviewCount: 45200,
    inStock: true,
    badge: 'Best Seller',
    tags: ['self-help', 'habits', 'james-clear', 'productivity', 'nonfiction'],
  },
  {
    id: 'rich-dad-poor-dad',
    name: 'Rich Dad Poor Dad — Robert Kiyosaki',
    category: 'Books',
    price: 349,
    originalPrice: 550,
    currency: 'INR',
    emoji: '📗',
    images: [
      U('1512820790803-83ca734da794'),
      U('1544947950-fa07a98d237f'),
      U('1495446815901-a7297e633e8d'),
    ],
    description: 'The most popular personal finance book of all time. What the rich teach their kids about money that the poor and middle class do not. 25th anniversary edition with updated content.',
    rating: 4.7,
    reviewCount: 38900,
    inStock: true,
    tags: ['finance', 'investing', 'kiyosaki', 'personal-finance', 'bestseller'],
  },
  {
    id: 'power-of-now-book',
    name: 'The Power of Now — Eckhart Tolle',
    category: 'Books',
    price: 399,
    originalPrice: 599,
    currency: 'INR',
    emoji: '📙',
    images: [
      U('1495446815901-a7297e633e8d'),
      U('1512820790803-83ca734da794'),
      U('1544947950-fa07a98d237f'),
    ],
    description: "A guide to spiritual enlightenment and mindful living. Tolle's message is simple: living in the now is the truest path to happiness and enlightenment. Published in 33 languages worldwide.",
    rating: 4.7,
    reviewCount: 22100,
    inStock: true,
    tags: ['spirituality', 'mindfulness', 'self-help', 'eckhart-tolle'],
  },

  // ── Fitness ────────────────────────────────────────────────────────────────
  {
    id: 'yoga-mat-bold',
    name: 'Boldfit Premium Yoga Mat 6mm (Anti-Slip)',
    category: 'Fitness',
    price: 699,
    originalPrice: 1299,
    currency: 'INR',
    emoji: '🧘',
    images: [
      U('1544367567-0f2fcb009e0b'),
      U('1506629082955-511b1aa562c8'),
      U('1518310383802-640c2de311b2'),
    ],
    description: '6mm thick TPE foam for superior cushioning. Double-sided anti-slip texture for stability. Moisture-resistant surface, easy to clean. Comes with a carry strap. 183 x 61 cm.',
    rating: 4.4,
    reviewCount: 15600,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['yoga-mat', 'boldfit', 'non-slip', 'tpe', 'exercise'],
  },
  {
    id: 'dumbell-5kg-pair',
    name: 'Kore Rubber Hex Dumbbell 5kg Pair',
    category: 'Fitness',
    price: 899,
    originalPrice: 1299,
    currency: 'INR',
    emoji: '🏋️',
    images: [
      U('1534438327276-14e5300c3a48'),
      U('1571019614242-c5c5dee9f50b'),
      U('1517836357463-d25dfeac3438'),
    ],
    description: 'Rubber-coated hex design prevents rolling and protects floors. Cast iron core with knurled chrome handle for a secure non-slip grip. Ideal for home gyms. 5kg x 2 pair.',
    rating: 4.5,
    reviewCount: 9870,
    inStock: true,
    badge: 'Best Seller',
    tags: ['dumbbell', 'kore', 'home-gym', 'rubber', 'strength'],
  },
  {
    id: 'resistance-bands-set',
    name: 'Boldfit Resistance Bands Set (5 Bands)',
    category: 'Fitness',
    price: 599,
    originalPrice: 999,
    currency: 'INR',
    emoji: '💪',
    images: [
      U('1518310383802-640c2de311b2'),
      U('1506629082955-511b1aa562c8'),
      U('1544367567-0f2fcb009e0b'),
    ],
    description: '5 resistance levels (10–50 lbs) for progressive training. 100% natural latex — durable, anti-snap. Suitable for physiotherapy, warm-ups, yoga, and strength training. Includes storage bag.',
    rating: 4.3,
    reviewCount: 11200,
    inStock: true,
    tags: ['resistance-bands', 'boldfit', 'latex', 'gym', 'yoga'],
  },
  {
    id: 'skipping-rope-pro',
    name: 'Strauss Pro Adjustable Jump Rope',
    category: 'Fitness',
    price: 349,
    originalPrice: 599,
    currency: 'INR',
    emoji: '🪢',
    images: [
      U('1517836357463-d25dfeac3438'),
      U('1534438327276-14e5300c3a48'),
      U('1571019614242-c5c5dee9f50b'),
    ],
    description: 'PVC rope with ball-bearing swivel handles for tangle-free smooth rotation. Adjustable length up to 10 feet. Anti-slip foam handles. Suitable for boxing, HIIT, and cardio workouts.',
    rating: 4.2,
    reviewCount: 7320,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['jump-rope', 'cardio', 'hiit', 'strauss', 'adjustable'],
  },

  // ── Accessories ────────────────────────────────────────────────────────────
  {
    id: 'fastrack-sport-watch',
    name: 'Fastrack NS8015SP01 Reflex 3.0 Smart Band',
    category: 'Accessories',
    price: 1495,
    originalPrice: 2495,
    currency: 'INR',
    emoji: '⌚',
    images: [
      U('1523275335684-37898b6baf30'),
      U('1508685096489-7aacd43bd3b1'),
      U('1559825481-12a05cc00344'),
    ],
    description: 'Full-touch colour display, 24/7 heart rate, sleep & activity tracking. 7-day battery life. IP68 water resistant. Stylish interchangeable straps. Compatible with Android & iOS.',
    rating: 4.2,
    reviewCount: 22300,
    inStock: true,
    badge: 'Best Seller',
    tags: ['fastrack', 'smartband', 'fitness-tracker', 'ip68', 'heart-rate'],
  },
  {
    id: 'wildcraft-wallet',
    name: 'Wildcraft Bifold RFID Blocking Wallet',
    category: 'Accessories',
    price: 699,
    originalPrice: 1199,
    currency: 'INR',
    emoji: '👛',
    images: [
      U('1627123373693-51edf7ebe462'),
      U('1558618047-3c8c76ca7d13'),
      U('1553062407-98eeb64c6a62'),
    ],
    description: 'Premium PU leather with RFID blocking technology to protect your cards. 6 card slots, 2 currency compartments, and 1 ID window. Slim profile fits in front pocket. Available in 5 colours.',
    rating: 4.3,
    reviewCount: 8760,
    inStock: true,
    tags: ['wildcraft', 'wallet', 'rfid', 'leather', 'bifold'],
  },
  {
    id: 'boat-wireless-charger',
    name: 'boAt Deuce 100 15W Wireless Charger',
    category: 'Accessories',
    price: 999,
    originalPrice: 1599,
    currency: 'INR',
    emoji: '🔋',
    images: [
      U('1591370874773-6702e8f12fd8'),
      U('1609091839311-d5365f9ff1c5'),
      U('1583394838336-acd977736f90'),
    ],
    description: '15W fast wireless charging for Qi-compatible devices. Smart chip for intelligent charging and overcharge protection. Works with cases up to 6mm thick. LED indicator ring. Non-slip base.',
    rating: 4.1,
    reviewCount: 5430,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['boat', 'wireless-charger', '15w', 'qi', 'fast-charge'],
  },
  {
    id: 'sunglasses-ray-ban',
    name: 'Ray-Ban RB3025 Classic Aviator Sunglasses',
    category: 'Accessories',
    price: 6490,
    originalPrice: 8990,
    currency: 'INR',
    emoji: '🕶️',
    images: [
      U('1511499767315-7875fca4e5ed'),
      U('1572635196237-14b3f281503f'),
      U('1473496169904-08571a29a04e'),
    ],
    description: "The iconic Ray-Ban Aviator, originally designed for US military pilots in 1937. Classic gold frame with G-15 green lenses offering 100% UV400 protection. Includes Ray-Ban case and cleaning cloth.",
    rating: 4.6,
    reviewCount: 13800,
    inStock: true,
    tags: ['ray-ban', 'sunglasses', 'aviator', 'uv400', 'polarized'],
  },

  // ── Beauty & Personal Care (more) ──────────────────────────────────────────
  {
    id: 'loreal-serum-3-5',
    name: "L'Oréal Paris Revitalift 1.5% Pure Hyaluronic Acid Serum 30ml",
    category: 'Beauty & Personal Care',
    price: 799,
    originalPrice: 1199,
    currency: 'INR',
    emoji: '💧',
    images: [
      U('1621576015534-28b10b00b2a1'),
      U('1556228453-efd6c1ff04f6'),
      U('1571781926291-c477ebfd024b'),
    ],
    description: '1.5% concentrated hyaluronic acid to deeply plump and visibly reduce wrinkles. Fragrance-free, suitable for sensitive skin. Apply morning and night under moisturiser for optimal results.',
    rating: 4.3,
    reviewCount: 21400,
    inStock: true,
    badge: 'Best Seller',
    tags: ['loreal', 'hyaluronic-acid', 'serum', 'anti-ageing', 'revitalift'],
  },
  {
    id: 'nivea-sunscreen-spf50',
    name: 'Nivea Sun Protect & Moisture SPF 50+ Sunscreen 75ml',
    category: 'Beauty & Personal Care',
    price: 349,
    originalPrice: 499,
    currency: 'INR',
    emoji: '☀️',
    images: [
      U('1556228720-195a672e8a03'),
      U('1584467541268-b040f83be3fd'),
      U('1607006344380-f6e9d4d17e14'),
    ],
    description: 'Broad-spectrum UVA + UVB protection with SPF 50+. Lightweight, non-greasy formula absorbs quickly. Moisturises for 24 hours while protecting from sun damage. Water-resistant for 4 hours.',
    rating: 4.4,
    reviewCount: 16700,
    inStock: true,
    tags: ['nivea', 'sunscreen', 'spf50', 'uv-protection', 'moisturiser'],
  },
  {
    id: 'gillette-fusion-razor',
    name: 'Gillette Fusion5 ProGlide Flexball Razor',
    category: 'Beauty & Personal Care',
    price: 549,
    originalPrice: 799,
    currency: 'INR',
    emoji: '🪒',
    images: [
      U('1585232354509-e6e6844a43c7'),
      U('1571781926291-c477ebfd024b'),
      U('1556228720-195a672e8a03'),
    ],
    description: '5 anti-friction blades and FlexBall handle to contour every curve of your face. Lubrication strip with mineral oil for a smooth glide. Precision trimmer on back for tricky spots. Includes 1 cartridge.',
    rating: 4.5,
    reviewCount: 34100,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['gillette', 'razor', 'flexball', 'shaving', 'mens-grooming'],
  },
];

export const CATEGORIES = [...new Set(CATALOG_PRODUCTS.map((p) => p.category))].sort();

// Also expose badge and originalPrice in responses (already part of interface)

// ─── Route Factory ────────────────────────────────────────────────────────────

export function createCatalogRouter(): Router {
  const router = Router();

  // GET /catalog  — list products with optional search & category filter
  router.get('/', (req: Request, res: Response) => {
    const search = (req.query['search'] as string | undefined)?.toLowerCase().trim();
    const category = req.query['category'] as string | undefined;

    let results = CATALOG_PRODUCTS;

    if (category && category !== 'All') {
      results = results.filter((p) => p.category === category);
    }

    if (search) {
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          p.tags.some((t) => t.includes(search)),
      );
    }

    res.json({ products: results, categories: CATEGORIES, total: results.length });
  });

  // GET /catalog/:id  — single product
  router.get('/:id', (req: Request, res: Response) => {
    const product = CATALOG_PRODUCTS.find((p) => p.id === req.params['id']);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    res.json(product);
  });

  // ── Catalog Image Management ────────────────────────────────────────────────
  //
  // Catalog images live in  uploads/catalog/<productId>.jpg  (or .png).
  // These are the "as-new" reference images Bedrock uses for identity check +
  // condition grading.  Drop images via the PUT endpoint before grading.

  const CATALOG_DIR = path.resolve('./uploads/catalog');

  // GET /catalog/images — list which products have a catalog image uploaded
  router.get('/images/list', async (_req: Request, res: Response) => {
    try {
      await fs.mkdir(CATALOG_DIR, { recursive: true });
      const files = await fs.readdir(CATALOG_DIR);
      const images = files
        .filter((f) => /\.(jpe?g|png)$/i.test(f))
        .map((f) => ({
          productId: f.replace(/\.(jpe?g|png)$/i, ''),
          filename: f,
          path: `catalog/${f}`,
        }));

      const productsWithImages = new Set(images.map((i) => i.productId));
      const missing = CATALOG_PRODUCTS
        .filter((p) => p.id.startsWith('item-grade-'))
        .filter((p) => !productsWithImages.has(p.id))
        .map((p) => p.id);

      res.json({ images, missing, catalogDir: CATALOG_DIR });
    } catch (err) {
      res.status(500).json({ error: 'Could not list catalog images.' });
    }
  });

  // PUT /catalog/images/:productId — upload a catalog reference image
  // Send the raw JPEG or PNG bytes as the request body.
  // Content-Type must be image/jpeg or image/png.
  // Example:
  //   curl -X PUT -H "Content-Type: image/jpeg" --data-binary @headphones.jpg \
  //        http://localhost:3001/api/catalog/images/item-grade-a
  router.put(
    '/images/:productId',
    express.raw({ type: 'image/*', limit: '20mb' }),
    async (req: Request, res: Response) => {
      const productId = req.params['productId'] as string;
      if (!productId || !/^[\w-]+$/.test(productId)) {
        res.status(400).json({ error: 'Invalid productId.' });
        return;
      }

      const ct = req.headers['content-type'] ?? 'image/jpeg';
      const ext = ct.includes('png') ? 'png' : 'jpg';
      const filename = `${productId}.${ext}`;
      const dest = path.join(CATALOG_DIR, filename);

      try {
        await fs.mkdir(CATALOG_DIR, { recursive: true });

        const body = req.body as Buffer | string;
        if (!body || (Buffer.isBuffer(body) && body.length === 0)) {
          res.status(400).json({ error: 'Request body is empty. Send raw image bytes.' });
          return;
        }

        const imageBytes = Buffer.isBuffer(body) ? body : Buffer.from(body as string, 'base64');
        await fs.writeFile(dest, imageBytes);

        res.status(200).json({
          message: `Catalog image saved for product '${productId}'.`,
          catalogImageRef: `catalog/${filename}`,
          path: dest,
          sizeBytes: imageBytes.length,
        });
      } catch (err) {
        res.status(500).json({ error: `Failed to save catalog image: ${err instanceof Error ? err.message : err}` });
      }
    }
  );

  // GET /catalog/images/:productId — check if a catalog image exists and serve it
  router.get('/images/:productId', async (req: Request, res: Response) => {
    const productId = req.params['productId'] as string;
    if (!productId || !/^[\w-]+$/.test(productId)) {
      res.status(400).json({ error: 'Invalid productId.' });
      return;
    }

    // Try both .jpg and .png
    for (const ext of ['jpg', 'jpeg', 'png']) {
      const filePath = path.join(CATALOG_DIR, `${productId}.${ext}`);
      if (existsSync(filePath)) {
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        res.setHeader('Content-Type', mime);
        res.sendFile(filePath);
        return;
      }
    }

    res.status(404).json({
      error: `No catalog image found for product '${productId}'.`,
      hint: `Upload one via: PUT /api/catalog/images/${productId} with Content-Type: image/jpeg`,
    });
  });

  return router;
}
