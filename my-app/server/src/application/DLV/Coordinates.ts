
import type {
  Coordinates
} from '../../infrastructure/DLV/ICourierStore.js';

export function parseCoordinates(value: string): Coordinates {
  const parts = value.split(',');

  if (parts.length !== 2 ||
      parts.some(part => part.trim() === '')) {
    throw new Error('Invalid coordinate format.');
  }

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new Error('Invalid coordinates.');
  }

  return { latitude, longitude };
}
