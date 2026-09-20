import { audioBufferToWav } from '../audio/wavEncoder';

/**
 * Generates a clean, rhythmic stereo test tone (beeps & sweeps)
 * perfect for testing 3D binaural HRTF spatial positioning.
 */
export function generateTestAudioWav(durationSec = 4.0, sampleRate = 48000): { name: string; buffer: ArrayBuffer; audioBuffer: AudioBuffer } {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate });
  const totalSamples = Math.floor(durationSec * sampleRate);
  const audioBuffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.getChannelData(1);

  // Generate pleasant rhythmic arpeggiated synth pulses (4 beats)
  const notes = [440, 554.37, 659.25, 880, 659.25, 554.37]; // A major arpeggio
  const pulseInterval = 0.25; // seconds per pulse

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const pulseIndex = Math.floor(t / pulseInterval);
    const pulseT = (t % pulseInterval);
    const freq = notes[pulseIndex % notes.length];

    // Envelope: quick attack, exponential decay
    const env = Math.exp(-pulseT * 14.0);

    // Harmonic blend: sine + subtle overtone
    const sample = (
      Math.sin(2 * Math.PI * freq * t) * 0.7 +
      Math.sin(4 * Math.PI * freq * t) * 0.2 +
      Math.sin(6 * Math.PI * freq * t) * 0.1
    ) * env * 0.6;

    leftChannel[i] = sample;
    rightChannel[i] = sample;
  }

  const wavArrayBuffer = audioBufferToWav(audioBuffer);

  return {
    name: 'Binaural_Test_Arp.wav',
    buffer: wavArrayBuffer,
    audioBuffer,
  };
}
