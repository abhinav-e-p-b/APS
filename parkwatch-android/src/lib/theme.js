// Assuming you already have your COLORS exported here too
export const COLORS = {
  bg: '#0D1B2A',
  surface: '#1B263B',
  border: '#415A77',
  text: '#E0E1DD',
  muted: '#778DA9',
  cyan: '#00D4FF',
  blue: '#3B82F6',
  accent: '#00E5A0',
  warn: '#F59E0B',
  danger: '#EF4444',
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