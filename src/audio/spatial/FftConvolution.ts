/**
 * Ultra-fast Radix-2 FFT and Overlap-Save Frequency-Domain Convolution
 * with Equal-Power Cosine Crossfade for click-free dynamic spatial audio.
 */

export class FastFft {
  private size: number;
  private cosTable: Float32Array;
  private sinTable: Float32Array;
  private bitRev: Uint32Array;

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of 2, received: ${size}`);
    }
    this.size = size;

    // Precompute twiddle factors
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      const angle = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }

    // Precompute bit reversal table
    this.bitRev = new Uint32Array(size);
    const bits = Math.round(Math.log2(size));
    for (let i = 0; i < size; i++) {
      let rev = 0;
      let temp = i;
      for (let j = 0; j < bits; j++) {
        rev = (rev << 1) | (temp & 1);
        temp >>= 1;
      }
      this.bitRev[i] = rev;
    }
  }

  public transform(real: Float32Array, imag: Float32Array) {
    const n = this.size;

    // Bit reversal permutation
    for (let i = 0; i < n; i++) {
      const rev = this.bitRev[i];
      if (i < rev) {
        const tr = real[i];
        real[i] = real[rev];
        real[rev] = tr;
        const ti = imag[i];
        imag[i] = imag[rev];
        imag[rev] = ti;
      }
    }

    // Cooley-Tukey butterfly stages
    for (let halfSize = 1; halfSize < n; halfSize *= 2) {
      const step = n / (halfSize * 2);
      for (let i = 0; i < n; i += halfSize * 2) {
        for (let j = 0; j < halfSize; j++) {
          const tableIdx = j * step;
          const c = this.cosTable[tableIdx];
          const s = this.sinTable[tableIdx];

          const rightIdx = i + j + halfSize;
          const leftIdx = i + j;

          const rReal = real[rightIdx];
          const rImag = imag[rightIdx];

          const tr = rReal * c - rImag * s;
          const ti = rReal * s + rImag * c;

          real[rightIdx] = real[leftIdx] - tr;
          imag[rightIdx] = imag[leftIdx] - ti;
          real[leftIdx] += tr;
          imag[leftIdx] += ti;
        }
      }
    }
  }

  public inverseTransform(real: Float32Array, imag: Float32Array) {
    // IFFT by conjugating, forward FFT, conjugating and scaling
    const n = this.size;
    for (let i = 0; i < n; i++) {
      imag[i] = -imag[i];
    }
    this.transform(real, imag);
    const invN = 1 / n;
    for (let i = 0; i < n; i++) {
      real[i] *= invN;
      imag[i] = -imag[i] * invN;
    }
  }
}

/**
 * Frequency-Domain Overlap-Save Convolution Block Processor
 */
export class OverlapSaveConvolver {
  public readonly blockSize: number; // L (e.g. 256)
  public readonly irLength: number;  // M (e.g. 128 or 256)
  public readonly fftSize: number;   // N = next power of 2 >= L + M - 1

  private fft: FastFft;
  private prevInput: Float32Array; // length: irLength - 1

  // FFT scratch buffers
  private inReal: Float32Array;
  private inImag: Float32Array;
  private irReal: Float32Array;
  private irImag: Float32Array;
  private outReal: Float32Array;
  private outImag: Float32Array;

  // Crossfade scratch buffers
  private altIrReal: Float32Array;
  private altIrImag: Float32Array;
  private altOutReal: Float32Array;
  private altOutImag: Float32Array;

  constructor(blockSize = 256, irLength = 256) {
    this.blockSize = blockSize;
    this.irLength = irLength;

    // Minimum FFT size for overlap-save: blockSize + irLength - 1
    const minFft = blockSize + irLength - 1;
    let n = 1;
    while (n < minFft) n <<= 1;
    this.fftSize = n;

    this.fft = new FastFft(n);
    this.prevInput = new Float32Array(irLength - 1);

    this.inReal = new Float32Array(n);
    this.inImag = new Float32Array(n);
    this.irReal = new Float32Array(n);
    this.irImag = new Float32Array(n);
    this.outReal = new Float32Array(n);
    this.outImag = new Float32Array(n);

    this.altIrReal = new Float32Array(n);
    this.altIrImag = new Float32Array(n);
    this.altOutReal = new Float32Array(n);
    this.altOutImag = new Float32Array(n);
  }

  public reset() {
    this.prevInput.fill(0);
  }

  /**
   * Convolves a block of input audio (length = this.blockSize) with current IR,
   * with optional smooth crossfade from previous IR if changed.
   *
   * @param inputChunk Float32Array of length this.blockSize
   * @param ir Float32Array of impulse response (length <= this.irLength)
   * @param prevIr Optional previous impulse response for click-free crossfading
   * @param output Destination Float32Array of length this.blockSize
   */
  public processBlock(
    inputChunk: Float32Array,
    ir: Float32Array,
    prevIr: Float32Array | null,
    output: Float32Array
  ) {
    const L = this.blockSize;
    const M = this.irLength;
    const N = this.fftSize;
    const overlapLen = M - 1;

    // Assemble input buffer: [overlapLen from prevInput, L from inputChunk, zeros]
    this.inReal.set(this.prevInput, 0);
    this.inReal.set(inputChunk, overlapLen);
    this.inReal.fill(0, overlapLen + L);
    this.inImag.fill(0);

    // Save tail of inputChunk into prevInput for next block
    if (L >= overlapLen) {
      this.prevInput.set(inputChunk.subarray(L - overlapLen, L));
    } else {
      const shift = overlapLen - L;
      this.prevInput.copyWithin(0, L, overlapLen);
      this.prevInput.set(inputChunk, shift);
    }

    // Forward FFT of input block
    this.fft.transform(this.inReal, this.inImag);

    // Prepare IR 1 in frequency domain
    this.irReal.fill(0);
    this.irImag.fill(0);
    this.irReal.set(ir.subarray(0, Math.min(ir.length, M)));
    this.fft.transform(this.irReal, this.irImag);

    // Complex multiplication for current IR: Out = In * IR
    for (let i = 0; i < N; i++) {
      const irR = this.irReal[i];
      const irI = this.irImag[i];
      const inR = this.inReal[i];
      const inI = this.inImag[i];
      this.outReal[i] = inR * irR - inI * irI;
      this.outImag[i] = inR * irI + inI * irR;
    }

    // Inverse FFT
    this.fft.inverseTransform(this.outReal, this.outImag);

    // If crossfade needed (sound source moved and IR changed)
    if (prevIr && prevIr !== ir) {
      this.altIrReal.fill(0);
      this.altIrImag.fill(0);
      this.altIrReal.set(prevIr.subarray(0, Math.min(prevIr.length, M)));
      this.fft.transform(this.altIrReal, this.altIrImag);

      for (let i = 0; i < N; i++) {
        const irR = this.altIrReal[i];
        const irI = this.altIrImag[i];
        const inR = this.inReal[i];
        const inI = this.inImag[i];
        this.altOutReal[i] = inR * irR - inI * irI;
        this.altOutImag[i] = inR * irI + inI * irR;
      }
      this.fft.inverseTransform(this.altOutReal, this.altOutImag);

      // Equal-power cosine crossfade over the block
      for (let i = 0; i < L; i++) {
        const t = i / L;
        const wCurr = Math.sin((Math.PI / 2) * t);
        const wPrev = Math.cos((Math.PI / 2) * t);

        const sampleCurr = this.outReal[overlapLen + i];
        const samplePrev = this.altOutReal[overlapLen + i];
        output[i] = samplePrev * wPrev + sampleCurr * wCurr;
      }
    } else {
      // Direct copy of the valid linear convolution segment
      for (let i = 0; i < L; i++) {
        output[i] = this.outReal[overlapLen + i];
      }
    }
  }
}
