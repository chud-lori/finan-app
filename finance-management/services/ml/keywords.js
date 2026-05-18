// Bilingual (English + Indonesian) keyword taxonomy.
// Ported byte-for-byte from finance-management-ai/models/classifier.py.
// Groups: essential | discretionary | savings | social | income | other
module.exports = {
  essential: [
    // Food (basic)
    'food', 'groceries', 'grocery', 'supermarket', 'market', 'pasar',
    'makan', 'nasi', 'warung', 'beli makan', 'sembako', 'sayur',
    'snack', 'cemilan', 'jajanan', 'makanan', 'minuman', 'drinks',
    'sarapan', 'lunch', 'dinner', 'breakfast', 'makan pagi', 'makan siang', 'makan malam',
    // Housing
    'rent', 'rental', 'housing', 'kost', 'kos', 'kontrakan', 'sewa rumah',
    'mortgage', 'cicilan rumah', 'ipl',
    // Household services
    'laundry', 'binatu', 'cuci baju', 'dry cleaning', 'cuci kering',
    'cleaning service', 'pembantu', 'art', 'asisten rumah tangga',
    // Utilities
    'utilities', 'electricity', 'listrik', 'water', 'air', 'pam',
    'gas', 'internet', 'wifi', 'phone', 'pulsa', 'paket data', 'token listrik',
    // Transport (commute)
    'transport', 'transportation', 'commute', 'bus', 'train', 'mrt', 'lrt',
    'ojek', 'bensin', 'fuel', 'petrol', 'bbm', 'toll', 'parkir',
    'transjakarta', 'krl',
    'motor', 'motorcycle', 'sepeda motor', 'mobil', 'car', 'angkot', 'angkutan',
    'grab car', 'gocar', 'taksi', 'taxi',
    // Health & medical
    'health', 'medical', 'medicine', 'obat', 'hospital', 'rumah sakit',
    'clinic', 'klinik', 'dokter', 'doctor', 'pharmacy', 'apotek',
    'vitamins', 'vitamin',
    // Insurance
    'insurance', 'asuransi', 'bpjs',
    // Education
    'education', 'school', 'sekolah', 'tuition', 'spp', 'kursus', 'les',
    'university', 'kampus',
    // Childcare
    'childcare', 'daycare', 'baby', 'bayi', 'susu bayi',
  ],
  discretionary: [
    // Dining out / café
    'dining', 'dining out', 'restaurant', 'cafe', 'coffee', 'kopi',
    'boba', 'bubble tea', 'fastfood', 'fast food', 'jajan',
    'nongkrong', 'hangout',
    // Entertainment
    'entertainment', 'hiburan', 'cinema', 'bioskop', 'konser', 'concert',
    'event', 'tiket', 'ticket',
    // Shopping / fashion
    'shopping', 'belanja', 'clothes', 'fashion', 'pakaian', 'baju',
    'sepatu', 'shoes', 'tas', 'bag', 'accessories', 'aksesoris',
    // Travel / vacation
    'travel', 'vacation', 'holiday', 'liburan', 'wisata', 'hotel',
    'airbnb', 'flight', 'pesawat', 'tiket pesawat',
    // Fitness / sport
    'sport', 'sports', 'gym', 'fitness', 'olahraga', 'futsal',
    // Subscriptions / digital
    'subscription', 'streaming', 'netflix', 'spotify', 'youtube',
    'disney', 'hbo', 'prime video',
    // Beauty / personal care
    'beauty', 'kecantikan', 'salon', 'spa', 'skincare', 'makeup',
    'barbershop', 'pangkas',
    // Gadgets / electronics
    'gadget', 'electronics', 'elektronik', 'hp', 'smartphone',
    // Alcohol / nightlife
    'alcohol', 'bar', 'pub', 'nightclub', 'rooftop',
    // Hobbies
    'hobby', 'hobbies', 'gaming', 'game', 'buku', 'book',
    // Pets
    'pet', 'hewan peliharaan', 'kucing', 'anjing',
  ],
  savings: [
    'saving', 'savings', 'tabungan', 'menabung', 'nabung',
    'investment', 'invest', 'investing', 'investasi',
    'stock', 'stocks', 'saham', 'reksa dana', 'reksadana',
    'mutual fund', 'bonds', 'obligasi',
    'crypto', 'cryptocurrency', 'bitcoin', 'eth',
    'retirement', 'pension', 'pensiun', 'dana pensiun',
    'emergency fund', 'dana darurat',
    'deposit', 'deposito', 'time deposit',
    'property', 'properti', 'tanah', 'rumah investasi',
    'gold', 'emas', 'logam mulia',
  ],
  social: [
    'gift', 'gifts', 'present', 'hadiah', 'kado',
    'donation', 'donate', 'charity', 'sedekah', 'zakat', 'infaq', 'wakaf',
    'sharing', 'berbagi',
    'family', 'keluarga', 'parents', 'orang tua', 'saudara',
    'wedding', 'pernikahan', 'nikahan', 'kondangan', 'walimah',
    'funeral', 'duka', 'lelayu',
    'gathering', 'arisan', 'reuni',
    'social', 'socializing',
    'transfer', 'kirim uang', 'send money',
    'tip', 'tips',
    'traktir', 'mentraktir',
  ],
  income: [
    'salary', 'gaji', 'upah', 'wage',
    'freelance', 'freelancing', 'project income', 'fee', 'honorarium',
    'business income', 'revenue', 'profit', 'usaha', 'pendapatan',
    'dividend', 'dividen',
    'interest income', 'bunga tabungan',
    'bonus', 'thr', 'commission', 'komisi',
    'rental income', 'passive income', 'sampingan',
    'refund', 'cashback', 'reimburse',
    'allowance', 'uang saku',
  ],
};
