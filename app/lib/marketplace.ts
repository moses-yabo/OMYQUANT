export const sections = [
  { id: 'all', name: 'Explore', icon: 'grid' }, { id: 'products', name: 'Farm market', icon: 'leaf' },
  { id: 'livestock', name: 'Livestock', icon: 'sun' }, { id: 'taxis', name: 'Taxi trips', icon: 'bus' },
  { id: 'trailers', name: 'Trailer rentals', icon: 'trailer' },
] as const;
export type Listing = { id: string; kind: string; name: string; description: string; price: number; unit: string; location: string; province: string; image: string; tag: string; quantity: number };
export const zar = (cents: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
export const samples: Listing[] = [
  { id: 'sample-1', kind: 'products', name: 'Fresh farm vegetables', description: 'A colourful harvest, straight from the farm. Seasonal produce from an independent grower.', price: 8500, unit: 'box', location: 'Pretoria', province: 'Gauteng', image: photo('photo-1540420773420-3366772f4999'), tag: 'Fresh produce', quantity: 24 },
  { id: 'sample-2', kind: 'livestock', name: 'Bonsmara cattle', description: 'Explore livestock listings and speak directly with independent farmers.', price: 1850000, unit: 'animal', location: 'Polokwane', province: 'Limpopo', image: photo('photo-1516467508483-a7212febe31a'), tag: 'Livestock', quantity: 8 },
  { id: 'sample-3', kind: 'products', name: 'Golden harvest maize', description: 'Locally grown maize for your farm or business.', price: 32000, unit: '50 kg bag', location: 'Bethlehem', province: 'Free State', image: photo('photo-1551754655-cd27e38d2076'), tag: 'Farm essentials', quantity: 100 },
  { id: 'sample-4', kind: 'trailers', name: 'Utility trailer rental', description: 'Make room for your next move. Reserve with an independent rental business and pay them directly.', price: 35000, unit: 'day', location: 'Centurion', province: 'Gauteng', image: '/images/trailer.svg', tag: 'Trailer rental', quantity: 1 },
  { id: 'sample-5', kind: 'taxis', name: 'Johannesburg → Durban', description: 'Discover scheduled departures from independent taxi operators.', price: 45000, unit: 'seat', location: 'Johannesburg', province: 'Gauteng', image: photo('photo-1464822759023-fed622ff2c3b'), tag: 'Long distance', quantity: 6 },
  { id: 'sample-6', kind: 'products', name: 'Farm-fresh eggs', description: 'Fresh eggs from a local agricultural seller.', price: 9000, unit: 'tray', location: 'Paarl', province: 'Western Cape', image: photo('photo-1506976785307-8732e854ad03'), tag: 'Farm favourites', quantity: 30 },
];
