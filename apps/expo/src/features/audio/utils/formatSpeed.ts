export function formatSpeed(speed: number): string {
  return speed === 1.0 ? '1x' : `${speed}x`;
}
