import type { Stop } from './types';

export function stopCoordinates(stop: Stop): [number, number] | null {
  const { latitude, longitude } = stop;
  if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [latitude, longitude];
}

export function directionsUrl(stop: Stop): string {
  const destination = stopCoordinates(stop)?.join(',') ?? stop.address;
  const params = new URLSearchParams({ daddr: destination, dirflg: 'd' });
  return 'https://maps.apple.com/?' + params;
}
