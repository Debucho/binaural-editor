import test from 'node:test';
import assert from 'node:assert/strict';

// Test interpolation
import { getInterpolatedPosition, cubicEaseInOut } from '../src/utils/interpolation.ts';
import { audioBufferToWav } from '../src/audio/wavEncoder.ts';
import { generateProjectCsv } from '../src/utils/csvExporter.ts';

test('generateProjectCsv produces valid CSV with trajectory rows', () => {
  const mockProject = {
    version: '1.0.0',
    name: 'Test Project',
    fps: 30,
    totalFrames: 2,
    loop: { enabled: false, startFrame: 0, endFrame: 30 },
    tracks: [
      {
        id: 'track-1',
        name: 'Vocal, Main',
        color: '#ff0000',
        volume: 1.0,
        muted: false,
        solo: false,
        clips: [],
        keyframes: [
          { id: 'k1', frame: 0, x: 0, y: 0, z: 1, interpolation: 'linear' },
          { id: 'k2', frame: 2, x: 2, y: 4, z: 6, interpolation: 'linear' },
        ],
      },
    ],
  };

  const csv = generateProjectCsv(mockProject);
  assert.ok(typeof csv === 'string');
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Track_ID,Track_Name,Frame,Time_Sec,X,Y,Z,Interpolation,Is_Keyframe');
  assert.ok(lines[1].includes('"Vocal, Main"'));
  assert.ok(lines[1].includes('track-1,'));
  assert.ok(lines[1].includes(',0,0.000,0.0000,0.0000,1.0000,linear,YES'));
  assert.ok(lines[2].includes(',1,0.033,1.0000,2.0000,3.5000,,NO'));
  assert.ok(lines[3].includes(',2,0.067,2.0000,4.0000,6.0000,linear,YES'));
});

test('cubicEaseInOut easing behavior', () => {
  assert.equal(cubicEaseInOut(0), 0);
  assert.equal(cubicEaseInOut(1), 1);
  assert.equal(cubicEaseInOut(0.5), 0.5);

  // Monotonically increasing
  let prev = 0;
  for (let t = 0.1; t <= 1.0; t += 0.1) {
    const val = cubicEaseInOut(t);
    assert.ok(val >= prev, `Expected ${val} >= ${prev}`);
    prev = val;
  }
});

test('getInterpolatedPosition with keyframes', () => {
  const keyframes = [
    { id: '1', frame: 0, x: 0, y: 0, z: 1, interpolation: 'linear' },
    { id: '2', frame: 30, x: 3, y: 6, z: 9, interpolation: 'linear' },
  ];

  // At frame 0
  const pos0 = getInterpolatedPosition(keyframes, 0);
  assert.deepEqual(pos0, { x: 0, y: 0, z: 1 });

  // At midpoint frame 15 (linear)
  const pos15 = getInterpolatedPosition(keyframes, 15);
  assert.deepEqual(pos15, { x: 1.5, y: 3, z: 5 });

  // At frame 30
  const pos30 = getInterpolatedPosition(keyframes, 30);
  assert.deepEqual(pos30, { x: 3, y: 6, z: 9 });

  // Clamp before first
  const posBefore = getInterpolatedPosition(keyframes, -10);
  assert.deepEqual(posBefore, { x: 0, y: 0, z: 1 });

  // Clamp after last
  const posAfter = getInterpolatedPosition(keyframes, 100);
  assert.deepEqual(posAfter, { x: 3, y: 6, z: 9 });
});

test('getInterpolatedPosition with bezier interpolation', () => {
  const keyframes = [
    { id: '1', frame: 0, x: 0, y: 0, z: 0, interpolation: 'bezier' },
    { id: '2', frame: 60, x: 10, y: 10, z: 10, interpolation: 'bezier' },
  ];

  const posMid = getInterpolatedPosition(keyframes, 30);
  assert.equal(posMid.x, 5);
  assert.equal(posMid.y, 5);
  assert.equal(posMid.z, 5);

  const posQuarter = getInterpolatedPosition(keyframes, 15);
  assert.ok(posQuarter.x < 2.5, 'Bezier ease-in should be slower at start');
});

test('audioBufferToWav generates valid RIFF WAVE binary', () => {
  // Mock AudioBuffer
  const sampleRate = 44100;
  const numSamples = 100;
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    left[i] = Math.sin(i / 10);
    right[i] = -Math.sin(i / 10);
  }

  const mockBuffer = {
    sampleRate,
    numberOfChannels: 2,
    length: numSamples,
    duration: numSamples / sampleRate,
    getChannelData: (ch) => (ch === 0 ? left : right),
  };

  const wavArrayBuffer = audioBufferToWav(mockBuffer);
  assert.ok(wavArrayBuffer instanceof ArrayBuffer);

  const view = new DataView(wavArrayBuffer);
  const getString = (offset, len) => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  };

  // Header assertions
  assert.equal(getString(0, 4), 'RIFF');
  assert.equal(getString(8, 4), 'WAVE');
  assert.equal(getString(12, 4), 'fmt ');
  assert.equal(view.getUint32(16, true), 16); // fmt chunk size
  assert.equal(view.getUint16(20, true), 1); // PCM format
  assert.equal(view.getUint16(22, true), 2); // 2 channels
  assert.equal(view.getUint32(24, true), sampleRate); // Sample rate
  assert.equal(view.getUint16(34, true), 16); // 16 bits per sample
  assert.equal(getString(36, 4), 'data');

  const expectedDataSize = numSamples * 2 * (16 / 8); // 400 bytes
  assert.equal(view.getUint32(40, true), expectedDataSize);
  assert.equal(wavArrayBuffer.byteLength, 44 + expectedDataSize);
});

test('track reordering logic: move and reorder array items correctly', () => {
  const tracks = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }];

  // Helper function matching store reorder logic
  const reorder = (arr, from, to) => {
    const copy = [...arr];
    const [removed] = copy.splice(from, 1);
    copy.splice(to, 0, removed);
    return copy;
  };

  // Move t1 to index 2
  const reordered = reorder(tracks, 0, 2);
  assert.deepEqual(reordered.map((t) => t.id), ['t2', 't3', 't1', 't4']);

  // Move t4 up to index 1
  const reordered2 = reorder(reordered, 3, 1);
  assert.deepEqual(reordered2.map((t) => t.id), ['t2', 't4', 't3', 't1']);
});

