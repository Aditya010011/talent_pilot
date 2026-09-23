export function getVideoConstraints(portrait: boolean): MediaTrackConstraints {
  return portrait
    ? { width: { ideal: 480 }, height: { ideal: 854 }, aspectRatio: { ideal: 9 / 16 } }
    : { width: { ideal: 640 }, height: { ideal: 480 }, aspectRatio: { ideal: 4 / 3 } };
}
