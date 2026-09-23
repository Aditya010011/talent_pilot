const TAP_THRESHOLD_PX = 5;

export function isTap(args: { startX: number; startY: number; endX: number; endY: number }): boolean {
  const dx = args.endX - args.startX;
  const dy = args.endY - args.startY;
  return Math.sqrt(dx * dx + dy * dy) < TAP_THRESHOLD_PX;
}
