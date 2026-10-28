export const categoryContent: Record<
  string,
  {
    title: string;
    description: string;
    action: string;
    placeholder: string;
    icon: string;
  }
> = {
  products: {
    title: "Fresh finds from local farms.",
    description:
      "Choose produce, feed or farm supplies below to place an order.",
    action: "Browse farm products",
    placeholder: "Search produce, feed or supplies",
    icon: "leaf",
  },
  livestock: {
    title: "Find livestock from local farmers.",
    description: "Explore animals and choose the right fit for your farm.",
    action: "Browse livestock",
    placeholder: "Search livestock or breeds",
    icon: "sun",
  },
  taxis: {
    title: "Where are you heading?",
    description:
      "Choose a departure, select your seats and reserve your journey.",
    action: "Find a taxi trip",
    placeholder: "Search a route or destination",
    icon: "bus",
  },
  trailers: {
    title: "Find a trailer for your next move.",
    description:
      "Choose a trailer and your rental dates to request a reservation.",
    action: "Find a trailer",
    placeholder: "Search trailers or collection towns",
    icon: "trailer",
  },
  saved: {
    title: "Pick up where you left off.",
    description: "Your saved listings, ready when you are.",
    action: "View saved listings",
    placeholder: "Search your saved listings",
    icon: "heart",
  },
  search: {
    title: "Find what you need.",
    description:
      "Refine your search below to find a product, journey or rental.",
    action: "View search results",
    placeholder: "What are you looking for?",
    icon: "search",
  },
};
