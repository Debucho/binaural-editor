import { Keyframe, Position3D } from '../types/project';

/**
 * Standard cubic ease in-out curve: S-shaped smooth transition
 * f(0) = 0, f(1) = 1, f'(0) = 0, f'(1) = 0
 */
export function cubicEaseInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Calculates interpolated 3D position at a specific frame
 */
export function getInterpolatedPosition(
  keyframes: Keyframe[],
  frame: number,
  defaultPos: Position3D = { x: 0, y: 0, z: 2 }
): Position3D {
  if (!keyframes || keyframes.length === 0) {
    return { ...defaultPos };
  }

  // Sort keyframes by frame ascending
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  // If before or at first keyframe
  if (frame <= sorted[0].frame) {
    return { x: sorted[0].x, y: sorted[0].y, z: sorted[0].z };
  }

  // If after or at last keyframe
  const lastIndex = sorted.length - 1;
  if (frame >= sorted[lastIndex].frame) {
    return { x: sorted[lastIndex].x, y: sorted[lastIndex].y, z: sorted[lastIndex].z };
  }

  // Find surrounding keyframes
  let k1 = sorted[0];
  let k2 = sorted[1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].frame <= frame && sorted[i + 1].frame >= frame) {
      k1 = sorted[i];
      k2 = sorted[i + 1];
      break;
    }
  }

  const frameDelta = k2.frame - k1.frame;
  if (frameDelta === 0) {
    return { x: k1.x, y: k1.y, z: k1.z };
  }

  const rawT = (frame - k1.frame) / frameDelta;
  const t = Math.max(0, Math.min(1, rawT));

  // Determine interpolation factor
  const factor = k1.interpolation === 'bezier' ? cubicEaseInOut(t) : t;

  return {
    x: k1.x + (k2.x - k1.x) * factor,
    y: k1.y + (k2.y - k1.y) * factor,
    z: k1.z + (k2.z - k1.z) * factor,
  };
}
