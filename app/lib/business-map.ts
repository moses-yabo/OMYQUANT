import { verificationStatus } from "./business-registry";
export type BusinessMapRecord = {
  _id: string;
  name: string;
  types: string[];
  active: boolean;
  verified: boolean;
  verificationStatus?: string;
  locations: {
    address?: string;
    province?: string;
    latitude?: number;
    longitude?: number;
    geocoding?: { label?: string; precision?: string; reviewed?: boolean };
  }[];
};
export type BusinessPin = {
  key: string;
  business: BusinessMapRecord;
  location: BusinessMapRecord["locations"][number];
  latitude: number;
  longitude: number;
};
export const mapStatusColors: Record<string, string> = {
  APPROVED: "#237a47",
  PENDING: "#bb7614",
  UNDER_REVIEW: "#327bc0",
  REJECTED: "#c34444",
  SUSPENDED: "#8b55b1",
  INACTIVE: "#6b7280",
};
export function mapStatus(business: BusinessMapRecord) {
  return business.active ? verificationStatus(business) : "INACTIVE";
}
export function hasCoordinates(
  location: BusinessMapRecord["locations"][number],
) {
  return (
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180
  );
}
export function businessPins(businesses: BusinessMapRecord[]): BusinessPin[] {
  return businesses.flatMap((business) =>
    business.locations.flatMap((location, index) =>
      hasCoordinates(location)
        ? [
            {
              key: `${business._id}:${index}`,
              business,
              location,
              latitude: location.latitude!,
              longitude: location.longitude!,
            },
          ]
        : [],
    ),
  );
}
export function coordinateInput(latitude: string, longitude: string) {
  if (!latitude.trim() && !longitude.trim()) return {};
  const location = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!latitude.trim() || !longitude.trim() || !hasCoordinates(location))
    throw new Error(
      "Enter both valid coordinates: latitude −90 to 90, longitude −180 to 180.",
    );
  return location;
}
export function filterMapBusinesses(
  records: BusinessMapRecord[],
  filters: { query: string; status: string; type: string; province: string },
) {
  const query = filters.query.trim().toLowerCase();
  return records.filter(
    (business) =>
      (!query ||
        [
          business.name,
          ...business.locations.map(
            (location) =>
              `${location.address ?? ""} ${location.province ?? ""}`,
          ),
        ].some((text) => text.toLowerCase().includes(query))) &&
      (filters.status === "all" || mapStatus(business) === filters.status) &&
      (filters.type === "all" || business.types.includes(filters.type)) &&
      (filters.province === "all" ||
        business.locations.some(
          (location) => location.province === filters.province,
        )),
  );
}
