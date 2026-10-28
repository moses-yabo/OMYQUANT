export const sections = [
  { id: "all", name: "Explore", icon: "grid" },
  { id: "products", name: "Farm market", icon: "leaf" },
  { id: "livestock", name: "Livestock", icon: "sun" },
  { id: "taxis", name: "Taxi trips", icon: "bus" },
  { id: "trailers", name: "Trailer rentals", icon: "trailer" },
] as const;
export type Listing = {
  id: string;
  kind: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  location: string;
  province: string;
  image: string;
  tag: string;
  quantity: number;
  hourlyPrice?: number;
  monthlyPrice?: number;
};
export const zar = (cents: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
export const samples: Listing[] = [
  {
    id: "sample-1",
    kind: "products",
    name: "Fresh farm vegetables",
    description:
      "A colourful harvest, straight from the farm. Seasonal produce from an independent grower.",
    price: 8500,
    unit: "box",
    location: "Pretoria",
    province: "Gauteng",
    image: photo("photo-1540420773420-3366772f4999"),
    tag: "Fresh produce",
    quantity: 24,
  },
  {
    id: "sample-2",
    kind: "livestock",
    name: "Cattle for sale",
    description:
      "Explore cattle listings and speak directly with independent farmers.",
    price: 1850000,
    unit: "animal",
    location: "Polokwane",
    province: "Limpopo",
    image: photo("photo-1597616456860-df68738ec8e4"),
    tag: "Cattle",
    quantity: 8,
  },
  {
    id: "sample-3",
    kind: "products",
    name: "Golden harvest maize",
    description: "Locally grown maize for your farm or business.",
    price: 32000,
    unit: "50 kg bag",
    location: "Bethlehem",
    province: "Free State",
    image: photo("photo-1551754655-cd27e38d2076"),
    tag: "Farm essentials",
    quantity: 100,
  },
  {
    id: "sample-4",
    kind: "trailers",
    name: "Utility trailer rental",
    description:
      "Make room for your next move. Reserve with an independent rental business and pay them directly.",
    price: 35000,
    unit: "day",
    location: "Centurion",
    province: "Gauteng",
    image: "/images/trailer.svg",
    tag: "Trailer rental",
    quantity: 1,
  },
  {
    id: "sample-5",
    kind: "taxis",
    name: "Johannesburg → Durban",
    description:
      "Discover scheduled departures from independent taxi operators.",
    price: 45000,
    unit: "seat",
    location: "Johannesburg",
    province: "Gauteng",
    image: photo("photo-1464822759023-fed622ff2c3b"),
    tag: "Long distance",
    quantity: 6,
  },
  {
    id: "sample-6",
    kind: "products",
    name: "Farm-fresh eggs",
    description: "Fresh eggs from a local agricultural seller.",
    price: 9000,
    unit: "tray",
    location: "Paarl",
    province: "Western Cape",
    image: photo("photo-1506976785307-8732e854ad03"),
    tag: "Farm favourites",
    quantity: 30,
  },
  {
    id: "sample-7",
    kind: "livestock",
    name: "Sheep for sale",
    description:
      "Browse sheep from an independent farmer. Contact the seller to discuss age, breed and collection.",
    price: 250000,
    unit: "animal",
    location: "Bethlehem",
    province: "Free State",
    image: photo("photo-1683228081328-4eea21a25ca9"),
    tag: "Sheep",
    quantity: 15,
  },
  {
    id: "sample-8",
    kind: "livestock",
    name: "Chickens for sale",
    description:
      "Live chickens from a local poultry seller. Arrange collection directly with the farmer.",
    price: 12000,
    unit: "bird",
    location: "Pretoria",
    province: "Gauteng",
    image: photo("photo-1683549188603-726164966a5c"),
    tag: "Chickens",
    quantity: 40,
  },
  {
    id: "sample-9",
    kind: "livestock",
    name: "Young chicks",
    description:
      "Young chicks for your poultry flock. Ask the seller about age, care requirements and collection.",
    price: 2000,
    unit: "chick",
    location: "Pietermaritzburg",
    province: "KwaZulu-Natal",
    image: photo("photo-1779866932818-4f632b4211bc"),
    tag: "Chicks",
    quantity: 100,
  },
  {
    id: "sample-10",
    kind: "livestock",
    name: "Goats for sale",
    description:
      "Connect with an independent goat farmer to discuss available animals and arrange collection.",
    price: 220000,
    unit: "animal",
    location: "Polokwane",
    province: "Limpopo",
    image: photo("photo-1730111766086-caf45c5e2e7c"),
    tag: "Goats",
    quantity: 12,
  },
  {
    id: "sample-11",
    kind: "products",
    name: "Fresh green cabbages",
    description:
      "Whole green cabbages from a local grower. Order by the head and arrange collection with the seller.",
    price: 2500,
    unit: "head",
    location: "Pretoria",
    province: "Gauteng",
    image: photo("photo-1697345208214-7deed24fb445"),
    tag: "Fresh produce",
    quantity: 80,
  },
  {
    id: "sample-12",
    kind: "products",
    name: "Fresh spinach",
    description:
      "Leafy green spinach sold in bunches for your kitchen or business.",
    price: 1500,
    unit: "bunch",
    location: "Paarl",
    province: "Western Cape",
    image: photo("photo-1574316071802-0d684efa7bf5"),
    tag: "Fresh produce",
    quantity: 60,
  },
  {
    id: "sample-13",
    kind: "products",
    name: "Grass hay bales",
    description:
      "Baled grass hay for livestock feed. Confirm bale size and collection arrangements with the seller.",
    price: 8500,
    unit: "bale",
    location: "Bethlehem",
    province: "Free State",
    image: photo("photo-1657165236255-27f7e3e21981"),
    tag: "Animal feed",
    quantity: 50,
  },
  {
    id: "sample-14",
    kind: "products",
    name: "Lucerne hay bales",
    description:
      "Lucerne forage sold by the bale. Ask the seller about bale weight, availability and collection.",
    price: 15000,
    unit: "bale",
    location: "Polokwane",
    province: "Limpopo",
    image: photo("photo-1581615760599-bbfa598a0b88"),
    tag: "Animal feed",
    quantity: 35,
  },
];
