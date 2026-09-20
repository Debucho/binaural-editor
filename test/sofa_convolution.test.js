import test from 'node:test';
import assert from 'node:assert/strict';

import { FastFft, OverlapSaveConvolver } from '../src/audio/spatial/FftConvolution.ts';
import { cartesianToSpherical, createNeumannKU100Dataset } from '../src/audio/spatial/HrirDataset.ts';
import { renderSofaAudio } from '../src/audio/spatial/SofaAudioRenderer.ts';
import { stereoBuffersToWav } from '../src/audio/wavEncoder.ts';
import { audioEngine } from '../src/audio/AudioEngine.ts';

test('FastFft round-trip reconstruction accuracy', () => {
  const n = 512;
  const fft = new FastFft(n);

  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  const origReal = new Float32Array(n);

  // Generate test signal
  for (let i = 0; i < n; i++) {
    real[i] = Math.sin((2 * Math.PI * 5 * i) / n) + 0.5 * Math.cos((2 * Math.PI * 13 * i) / n);
    origReal[i] = real[i];
  }

  // Forward FFT
  fft.transform(real, imag);

  // Inverse FFT
  fft.inverseTransform(real, imag);

  // Assert round-trip reconstruction error < 1e-5
  for (let i = 0; i < n; i++) {
    const diff = Math.abs(real[i] - origReal[i]);
    assert.ok(diff < 1e-5, `Sample ${i} mismatch: ${real[i]} vs ${origReal[i]} (diff: ${diff})`);
    assert.ok(Math.abs(imag[i]) < 1e-5, `Imaginary leakage: ${imag[i]}`);
  }
});

test('OverlapSaveConvolver matches direct time-domain convolution', () => {
  const blockSize = 128;
  const irLength = 64;
  const convolver = new OverlapSaveConvolver(blockSize, irLength);

  // Simple lowpass FIR impulse response
  const ir = new Float32Array(irLength);
  for (let i = 0; i < irLength; i++) {
    ir[i] = Math.exp(-i / 10);
  }

  // Input signal
  const input = new Float32Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    input[i] = (i % 7) * 0.1;
  }

  const outputFft = new Float32Array(blockSize);
  convolver.processBlock(input, ir, null, outputFft);

  // Direct linear time-domain convolution for the first block (with zero initial state)
  const outputDirect = new Float32Array(blockSize);
  for (let n = 0; n < blockSize; n++) {
    let sum = 0;
    for (let k = 0; k <= n && k < irLength; k++) {
      sum += input[n - k] * ir[k];
    }
    outputDirect[n] = sum;
  }

  // Compare output
  for (let i = 0; i < blockSize; i++) {
    const diff = Math.abs(outputFft[i] - outputDirect[i]);
    assert.ok(diff < 1e-4, `Sample ${i} mismatch: FFT ${outputFft[i]} vs Direct ${outputDirect[i]}`);
  }
});

test('OverlapSaveConvolver crossfade produces smooth transition without discontinuity', () => {
  const blockSize = 256;
  const irLength = 128;
  const convolver = new OverlapSaveConvolver(blockSize, irLength);

  const ir1 = new Float32Array(irLength);
  ir1[5] = 1.0; // delay 5

  const ir2 = new Float32Array(irLength);
  ir2[20] = 0.8; // delay 20

  const input = new Float32Array(blockSize);
  input.fill(0.5);

  const output = new Float32Array(blockSize);
  // Process with crossfade from ir1 to ir2
  convolver.processBlock(input, ir2, ir1, output);

  // Output should be smooth, finite, and well within bounds
  for (let i = 0; i < blockSize; i++) {
    assert.ok(!isNaN(output[i]), `NaN detected at ${i}`);
    assert.ok(Math.abs(output[i]) < 2.0, `Discontinuity explosion at ${i}: ${output[i]}`);
  }
});

test('HrirDataset coordinates and Neumann KU100 generation', () => {
  // Test Cartesian to Spherical (SOFA AES69 convention: 0 Front, 90 Left, 180 Back, 270 Right)
  const front = cartesianToSpherical(0, 0, -2);
  assert.equal(Math.round(front.azimuth), 0, 'Front (-Z) azimuth should be 0');
  assert.equal(Math.round(front.elevation), 0, 'Front elevation should be 0');

  const left = cartesianToSpherical(-3, 0, 0);
  assert.equal(Math.round(left.azimuth), 90, 'Left (-X) azimuth should be 90');

  const right = cartesianToSpherical(3, 0, 0);
  assert.equal(Math.round(right.azimuth), 270, 'Right (+X) azimuth should be 270');

  const back = cartesianToSpherical(0, 0, 2);
  assert.equal(Math.round(back.azimuth), 180, 'Back (+Z) azimuth should be 180');

  // Built-in Neumann KU100
  const dataset = createNeumannKU100Dataset(48000, 256);
  assert.ok(dataset.points.length > 100, 'Should have rich measurement grid');
  assert.equal(dataset.profile.sampleRate, 48000);

  // For sound to the right (+X), right ear should receive direct impulse earlier and louder than left ear
  const hrirRight = dataset.getHrirForCartesian(2, 0, 0);
  let maxIdxLeft = 0, maxValLeft = 0;
  let maxIdxRight = 0, maxValRight = 0;
  for (let i = 0; i < 100; i++) {
    if (Math.abs(hrirRight.irLeft[i]) > maxValLeft) {
      maxValLeft = Math.abs(hrirRight.irLeft[i]);
      maxIdxLeft = i;
    }
    if (Math.abs(hrirRight.irRight[i]) > maxValRight) {
      maxValRight = Math.abs(hrirRight.irRight[i]);
      maxIdxRight = i;
    }
  }
  assert.ok(maxIdxRight <= maxIdxLeft, 'Right ear should receive earlier arrival for sound on the right');
  assert.ok(maxValRight > maxValLeft, 'Right ear should be louder for sound on the right');

  // For sound to the left (-X), left ear should receive direct impulse earlier and louder than right ear
  const hrirLeft = dataset.getHrirForCartesian(-2, 0, 0);
  let maxIdxLeftL = 0, maxValLeftL = 0;
  let maxIdxRightL = 0, maxValRightL = 0;
  for (let i = 0; i < 100; i++) {
    if (Math.abs(hrirLeft.irLeft[i]) > maxValLeftL) {
      maxValLeftL = Math.abs(hrirLeft.irLeft[i]);
      maxIdxLeftL = i;
    }
    if (Math.abs(hrirLeft.irRight[i]) > maxValRightL) {
      maxValRightL = Math.abs(hrirLeft.irRight[i]);
      maxIdxRightL = i;
    }
  }
  assert.ok(maxIdxLeftL <= maxIdxRightL, 'Left ear should receive earlier arrival for sound on the left');
  assert.ok(maxValLeftL > maxValRightL, 'Left ear should be louder for sound on the left');
});

test('stereoBuffersToWav creates valid 16-bit 48kHz WAV binary', () => {
  const sampleRate = 48000;
  const numSamples = 240;
  const left = new Float32Array(numSamples).fill(0.3);
  const right = new Float32Array(numSamples).fill(-0.3);

  const wavBuf = stereoBuffersToWav(left, right, sampleRate);
  assert.ok(wavBuf instanceof ArrayBuffer);
  assert.equal(wavBuf.byteLength, 44 + numSamples * 2 * 2);

  const view = new DataView(wavBuf);
  assert.equal(view.getUint32(24, true), 48000, 'Sample rate should be 48000');
  assert.equal(view.getUint16(22, true), 2, 'Channels should be 2');
  assert.equal(view.getUint16(34, true), 16, 'Bit depth should be 16');
});

test('renderSofaAudio end-to-end renders correct Left/Right stereo balance', async () => {
  const sampleRate = 48000;
  const numSamples = 2400; // 0.05 seconds
  const testBufferData = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    testBufferData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }

  const mockAudioBuffer = {
    sampleRate,
    length: numSamples,
    duration: numSamples / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => testBufferData,
  };

  audioEngine.audioBufferCache.set('test-track.wav', mockAudioBuffer);

  const dataset = createNeumannKU100Dataset(sampleRate, 256);

  // 1. Render sound on the RIGHT (+X = 3, Z = -1)
  const trackRight = {
    id: 'tr-right',
    name: 'Right Source',
    volume: 1.0,
    muted: false,
    solo: false,
    clips: [
      {
        id: 'clip-r',
        filePath: 'test-track.wav',
        startFrame: 0,
        durationFrames: 30,
        trimStartSec: 0,
        durationSec: 0.05,
      },
    ],
    keyframes: [
      { id: 'kf-r1', frame: 0, x: 3, y: 0, z: -1, interpolation: 'linear' },
    ],
  };

  const resultRight = await renderSofaAudio([trackRight], 30, 30, dataset, sampleRate);
  let rmsRightL = 0, rmsRightR = 0;
  for (let i = 0; i < resultRight.totalSamples; i++) {
    rmsRightL += resultRight.left[i] * resultRight.left[i];
    rmsRightR += resultRight.right[i] * resultRight.right[i];
  }
  rmsRightL = Math.sqrt(rmsRightL / resultRight.totalSamples);
  rmsRightR = Math.sqrt(rmsRightR / resultRight.totalSamples);

  assert.ok(
    rmsRightR > rmsRightL * 1.5,
    `Right source at +X should have significantly louder Right channel (R: ${rmsRightR.toFixed(4)} vs L: ${rmsRightL.toFixed(4)})`
  );

  // 2. Render sound on the LEFT (-X = -3, Z = -1)
  const trackLeft = {
    id: 'tr-left',
    name: 'Left Source',
    volume: 1.0,
    muted: false,
    solo: false,
    clips: [
      {
        id: 'clip-l',
        filePath: 'test-track.wav',
        startFrame: 0,
        durationFrames: 30,
        trimStartSec: 0,
        durationSec: 0.05,
      },
    ],
    keyframes: [
      { id: 'kf-l1', frame: 0, x: -3, y: 0, z: -1, interpolation: 'linear' },
    ],
  };

  const resultLeft = await renderSofaAudio([trackLeft], 30, 30, dataset, sampleRate);
  let rmsLeftL = 0, rmsLeftR = 0;
  for (let i = 0; i < resultLeft.totalSamples; i++) {
    rmsLeftL += resultLeft.left[i] * resultLeft.left[i];
    rmsLeftR += resultLeft.right[i] * resultLeft.right[i];
  }
  rmsLeftL = Math.sqrt(rmsLeftL / resultLeft.totalSamples);
  rmsLeftR = Math.sqrt(rmsLeftR / resultLeft.totalSamples);

  assert.ok(
    rmsLeftL > rmsLeftR * 1.5,
    `Left source at -X should have significantly louder Left channel (L: ${rmsLeftL.toFixed(4)} vs R: ${rmsLeftR.toFixed(4)})`
  );
});
