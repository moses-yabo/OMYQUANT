export const complaintCategories = {
  damaged_delivery: 'Damaged or broken delivery',
  late_delivery: 'Late delivery or service delay',
  spoiled_goods: 'Spoiled or rotten farm goods',
  sick_livestock: 'Sick livestock',
  booking: 'Taxi booking problem',
  rental: 'Trailer rental problem',
  other: 'Other complaint',
} as const;
export const complaintStatuses = { open: 'Open', in_review: 'Under review', resolved: 'Resolved', closed: 'Closed' } as const;
