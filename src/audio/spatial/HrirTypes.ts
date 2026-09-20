/**
 * Core type definitions for HRIR (Head-Related Impulse Response) and SOFA spatialization
 */

export interface SphericalCoord {
  azimuth: number; // Degrees: -180 to 180 (0 = front, 90 = right, -90 = left, 180/-180 = back)
  elevation: number; // Degrees: -90 to +90 (0 = horizontal, +90 = zenith, -90 = nadir)
  distance: number; // Meters
}

export interface HrirPoint {
  azimuth: number;
  elevation: number;
  distance: number;
  irLeft: Float32Array;
  irRight: Float32Array;
}

export interface HrirProfile {
  id: string;
  name: string;
  description: string;
  sampleRate: number;
  irLength: number;
  pointsCount: number;
  isCustom?: boolean;
}

export type SpatialEngineType = 'sofa' | 'webaudio';

export interface SpatialSettings {
  engine: SpatialEngineType;
  selectedHrirId: string;
  autoRamPreview: boolean;
  irLength: number;
}
