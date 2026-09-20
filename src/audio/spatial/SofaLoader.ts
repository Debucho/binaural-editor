import { HrirDataset } from './HrirDataset';
import { HrirPoint, HrirProfile } from './HrirTypes';

/**
 * Loader for SOFA / JSON / WAV HRIR datasets
 */
export class SofaLoader {
  /**
   * Loads HRIR dataset from ArrayBuffer (SOFA, JSON, or WAV)
   */
  public static async loadFromBuffer(
    buffer: ArrayBuffer,
    fileName: string
  ): Promise<HrirDataset> {
    const nameLower = fileName.toLowerCase();

    if (nameLower.endsWith('.json')) {
      return this.loadFromJson(buffer, fileName);
    } else if (nameLower.endsWith('.sofa')) {
      return this.loadFromSofa(buffer, fileName);
    } else if (nameLower.endsWith('.wav')) {
      return this.loadFromWav(buffer, fileName);
    } else {
      // Try JSON first, then fallback
      try {
        return this.loadFromJson(buffer, fileName);
      } catch {
        return this.loadFromSofa(buffer, fileName);
      }
    }
  }

  /**
   * Loads from JSON format HRIR dataset
   */
  private static loadFromJson(buffer: ArrayBuffer, fileName: string): HrirDataset {
    const text = new TextDecoder('utf-8').decode(buffer);
    const data = JSON.parse(text);

    const name = data.name || fileName.replace(/\.[^/.]+$/, '');
    const sampleRate = data.sampleRate || 48000;
    const rawPoints = data.points || data.measurements || [];

    if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
      throw new Error('JSON内に有効なHRIR測定点(points配列)が見つかりませんでした。');
    }

    const points: HrirPoint[] = rawPoints.map((pt: any) => {
      return {
        azimuth: Number(pt.azimuth ?? pt.az ?? 0),
        elevation: Number(pt.elevation ?? pt.el ?? 0),
        distance: Number(pt.distance ?? 1.0),
        irLeft: new Float32Array(pt.irLeft || pt.left || []),
        irRight: new Float32Array(pt.irRight || pt.right || []),
      };
    });

    const irLength = points[0].irLeft.length || 256;

    const profile: HrirProfile = {
      id: `custom-${Date.now()}`,
      name: `${name} (カスタム)`,
      description: data.description || `外部読み込みHRIRデータセット (${points.length} 測位点)`,
      sampleRate,
      irLength,
      pointsCount: points.length,
      isCustom: true,
    };

    return new HrirDataset(profile, points);
  }

  /**
   * Loads from SOFA format (AES69)
   */
  private static async loadFromSofa(buffer: ArrayBuffer, fileName: string): Promise<HrirDataset> {
    const bytes = new Uint8Array(buffer);

    // Check for HDF5 / NetCDF signature
    const isHdf5 = bytes[0] === 0x89 && bytes[1] === 0x48 && bytes[2] === 0x44 && bytes[3] === 0x46; // \x89HDF
    const isNetCdf = bytes[0] === 0x43 && bytes[1] === 0x44 && bytes[2] === 0x46; // CDF

    const name = fileName.replace(/\.[^/.]+$/, '');

    // Try netcdfjs if it's NetCDF format
    try {
      if (isNetCdf) {
        const { NetCDFReader } = await import('netcdfjs');
        const reader = new NetCDFReader(buffer);

        const sampleRate = Number(reader.getDataVariable('Data.SamplingRate')?.[0] || 48000);
        const sourcePos = reader.getDataVariable('SourcePosition');
        const dataIR = reader.getDataVariable('Data.IR');

        if (sourcePos && dataIR) {
          // Parse SOFA variables
          const points: HrirPoint[] = [];
          const numM = sourcePos.length / 3;
          const irLen = dataIR.length / (numM * 2);

          for (let m = 0; m < numM; m++) {
            const az = sourcePos[m * 3];
            const el = sourcePos[m * 3 + 1];
            const dist = sourcePos[m * 3 + 2] || 1.0;

            const leftOffset = m * 2 * irLen;
            const rightOffset = leftOffset + irLen;

            const irLeft = new Float32Array(irLen);
            const irRight = new Float32Array(irLen);

            for (let i = 0; i < irLen; i++) {
              irLeft[i] = dataIR[leftOffset + i];
              irRight[i] = dataIR[rightOffset + i];
            }

            points.push({ azimuth: az, elevation: el, distance: dist, irLeft, irRight });
          }

          const profile: HrirProfile = {
            id: `sofa-${Date.now()}`,
            name: `${name} (SOFA)`,
            description: `SOFA (AES69) インパルス応答 (${points.length} 測位点)`,
            sampleRate,
            irLength: irLen,
            pointsCount: points.length,
            isCustom: true,
          };

          return new HrirDataset(profile, points);
        }
      }
    } catch (err) {
      console.warn('NetCDF parsing failed or unsupported variant, trying fallback:', err);
    }

    if (isHdf5) {
      throw new Error(
        `SOFAファイル "${fileName}" はHDF5形式です。SOFAツール(pysofaconventionsやsofa2json)でエクスポートされたJSONまたはWAV形式、または標準SOFA NetCDF形式をご使用ください。`
      );
    }

    throw new Error(
      `SOFAファイルのパースに失敗しました。対応形式: SOFA(NetCDF), HRIR JSON, またはステレオWAV`
    );
  }

  /**
   * Loads from stereo WAV format as a front HRIR measurement
   */
  private static async loadFromWav(buffer: ArrayBuffer, fileName: string): Promise<HrirDataset> {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));

    const sampleRate = audioBuffer.sampleRate;
    const irLength = Math.min(512, audioBuffer.length);

    const left = audioBuffer.getChannelData(0).subarray(0, irLength);
    const right = (audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left).subarray(0, irLength);

    const points: HrirPoint[] = [
      {
        azimuth: 0,
        elevation: 0,
        distance: 1.0,
        irLeft: new Float32Array(left),
        irRight: new Float32Array(right),
      },
    ];

    const profile: HrirProfile = {
      id: `wav-${Date.now()}`,
      name: `${fileName.replace(/\.[^/.]+$/, '')} (WAV)`,
      description: `WAVインパルス応答 (${irLength} サンプル)`,
      sampleRate,
      irLength,
      pointsCount: 1,
      isCustom: true,
    };

    return new HrirDataset(profile, points);
  }
}
