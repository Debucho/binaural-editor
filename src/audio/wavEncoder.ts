/**
 * Encodes stereo Float32Array channels into standard 16-bit PCM Stereo RIFF WAV ArrayBuffer
 */
export function stereoBuffersToWav(
  channel0: Float32Array,
  channel1: Float32Array,
  sampleRate = 48000
): ArrayBuffer {
  const numChannels = 2;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const numSamples = Math.min(channel0.length, channel1.length);
  const dataByteLength = numSamples * blockAlign;
  const bufferByteLength = 44 + dataByteLength;

  const arrayBuffer = new ArrayBuffer(bufferByteLength);
  const view = new DataView(arrayBuffer);

  /* Helper to write ascii string */
  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF identifier
  writeString(0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + dataByteLength, true);
  // RIFF type
  writeString(8, 'WAVE');
  // format chunk identifier
  writeString(12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * blockAlign, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(36, 'data');
  // data chunk length
  view.setUint32(40, dataByteLength, true);

  // Write interleaved PCM samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Channel 0 (Left)
    let s0 = Math.max(-1, Math.min(1, channel0[i]));
    let val0 = s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff;
    view.setInt16(offset, val0, true);
    offset += 2;

    // Channel 1 (Right)
    let s1 = Math.max(-1, Math.min(1, channel1[i]));
    let val1 = s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff;
    view.setInt16(offset, val1, true);
    offset += 2;
  }

  return arrayBuffer;
}

/**
 * Encodes an AudioBuffer into standard 16-bit PCM Stereo RIFF WAV ArrayBuffer
 */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const channel0 = buffer.getChannelData(0);
  const channel1 = numChannels > 1 ? buffer.getChannelData(1) : channel0;

  return stereoBuffersToWav(channel0, channel1, sampleRate);
}
