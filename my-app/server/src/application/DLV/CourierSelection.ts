
import type {
  CourierLocation,
  Coordinates
} from '../../infrastructure/DLV/ICourierStore.js';

export function selectNearestCourier(
  restaurant: Coordinates,
  couriers: CourierLocation[]
): CourierLocation | null {
  if (couriers.length === 0) {
    return null;
  }

  const sorted = [...couriers].sort((a, b) => {
    const distanceA =
      (a.latitude - restaurant.latitude) ** 2 +
      (a.longitude - restaurant.longitude) ** 2;

    const distanceB =
      (b.latitude - restaurant.latitude) ** 2 +
      (b.longitude - restaurant.longitude) ** 2;

    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }

    // Lowest numeric courier ID wins ties.
    const idA = BigInt(a.id);
    const idB = BigInt(b.id);

    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  return sorted[0];
}
