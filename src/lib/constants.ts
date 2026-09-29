export const API_BASE = '/api';
export const POLL_INTERVAL_MS = 300000; // 5 min fallback — Pusher handles real-time
export const RATE_CACHE_DURATION = 60 * 60 * 1000;
export const RATE_FETCH_COOLDOWN = 5 * 60 * 1000;

export const currencies: string[] = [
  "AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN","BAM","BBD","BDT","BGN","BHD","BIF","BMD","BND","BOB","BRL","BSD","BTN","BWP","BYN","BZD","CAD","CDF","CHF","CLP","CNY","COP","CRC","CUP","CVE","CZK","DJF","DKK","DOP","DZD","EGP","ERN","ETB","EUR","FJD","FKP","FOK","GBP","GEL","GGP","GHS","GIP","GMD","GNF","GTQ","GYD","HKD","HNL","HRK","HTG","HUF","IDR","ILS","IMP","INR","IQD","IRR","ISK","JEP","JMD","JOD","JPY","KES","KGS","KHR","KID","KMF","KRW","KWD","KYD","KZT","LAK","LBP","LKR","LRD","LSL","LYD","MAD","MDL","MGA","MKD","MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MYR","MZN","NAD","NGN","NIO","NOK","NPR","NZD","OMR","PAB","PEN","PGK","PHP","PKR","PLN","PYG","QAR","RON","RSD","RUB","RWF","SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLE","SLL","SOS","SRD","SSP","STN","SYP","SZL","THB","TJS","TMT","TND","TOP","TRY","TTD","TVD","TWD","TZS","UAH","UGX","USD","UYU","UZS","VES","VND","VUV","WST","XAF","XCD","XDR","XOF","XPF","YER","ZAR","ZMW","ZWL"
];

export const popularCurrencies: string[] = ["USD","EUR","GBP","JPY","CAD","AUD","CHF","CNY","INR","MXN","BRL","RUB"];

export const chartColors: string[] = [
  '#007AFF', '#5E5CE6', '#30B0C7', '#34C759',
  '#FF9F0A', '#8E8E93', '#BF5AF2', '#FF453A',
  '#64D2FF', '#A2845E'
];

export const defaultExpenseCategories: string[] = ['Food & Dining', 'Housing', 'Transportation', 'Utilities', 'Entertainment', 'Healthcare', 'Shopping', 'Gifts', 'Other'];
export const defaultIncomeCategories: string[] = ['Salary', 'Freelance', 'Investments', 'Gifts', 'Other'];

export const categoryIcons: Record<string, string> = {
  'Food & Dining': 'ph-hamburger',
  'Housing': 'ph-house',
  'Transportation': 'ph-car',
  'Utilities': 'ph-lightbulb',
  'Entertainment': 'ph-game-controller',
  'Healthcare': 'ph-first-aid',
  'Shopping': 'ph-shopping-bag',
  'Salary': 'ph-money',
  'Freelance': 'ph-laptop',
  'Investments': 'ph-chart-line-up',
  'Gifts': 'ph-gift',
  'Other': 'ph-dots-three-circle'
};

export const currencySymbols: Record<string, string> = {
  'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥',
  'KRW': '₩', 'INR': '₹', 'BRL': 'R$', 'CAD': '$', 'AUD': '$',
  'CHF': 'CHF', 'MXN': '$', 'RUB': '₽', 'SEK': 'kr', 'NOK': 'kr',
  'DKK': 'kr', 'PLN': 'zł', 'TRY': '₺', 'ZAR': 'R', 'THB': '฿',
  'VND': '₫', 'IDR': 'Rp', 'SGD': '$', 'HKD': '$', 'NZD': '$'
};
