export const COLORS = {
  bg: '#0D1B2A',
  surface: '#132033',
  border: '#1E3550',
  accent: '#00e5a0',
  blue: '#3b82f6',
  cyan: '#00D4FF',
  warn: '#f59e0b',
  danger: '#ef4444',
  text: '#e2e8f0',
  muted: '#64748b',
  white: '#FFFFFF',
};

export const PARKING_PLANS = [
  { id: 'daily',   label: 'Daily Pass',   price: 30,   period: 'per day',    popular: false },
  { id: 'weekly',  label: 'Weekly Pass',  price: 150,  period: 'per 7 days', popular: true  },
  { id: 'monthly', label: 'Monthly Pass', price: 500,  period: 'per month',  popular: false },
  { id: 'yearly',  label: 'Yearly Pass',  price: 5000, period: 'per year',   popular: false },
];

export const VEHICLE_TYPES = [
  { id: '2-wheeler', emoji: '🛵', label: '2-Wheeler' },
  { id: '4-wheeler', emoji: '🚗', label: '4-Wheeler' },
  { id: 'suv-van',   emoji: '🚙', label: 'SUV / Van' },
];

export const MOCK_ADMIN = { id: 'admin', password: 'admin123' };
