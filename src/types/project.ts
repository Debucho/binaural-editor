export type InterpolationType = 'linear' | 'bezier';

export interface Keyframe {
  id: string;
  frame: number;
  x: number;
  y: number;
  z: number;
  interpolation: InterpolationType;
}

export interface AudioClip {
  id: string;
  trackId: string;
  name: string;
  filePath: string;
  startFrame: number;
  durationFrames: number;
  trimStartSec: number;
  durationSec: number; // trimmed duration in seconds
  fileDurationSec: number; // total original file duration
  peaks?: number[]; // simplified waveform peaks array (0..1)
}

export interface Track {
  id: string;
  name: string;
  color: string;
  volume: number; // 0.0 - 1.5, default 1.0
  muted: boolean;
  solo: boolean;
  clips: AudioClip[];
  keyframes: Keyframe[];
}

export interface LoopSettings {
  enabled: boolean;
  startFrame: number;
  endFrame: number;
}

export type SpatialEngineType = 'sofa' | 'webaudio';

export interface SpatialSettings {
  engine: SpatialEngineType;
  selectedHrirId: string;
  autoRamPreview: boolean;
}

export interface ProjectData {
  version: string;
  name: string;
  fps: 30 | 60;
  totalFrames: number;
  loop: LoopSettings;
  tracks: Track[];
  spatialSettings?: SpatialSettings;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}
