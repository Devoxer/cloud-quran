import { buildManifestUrl } from '@/features/audio/utils/audioUrlBuilder';

export interface VerseTiming {
  verseKey: string;
  timestampFrom: number;
  timestampTo: number;
  segments?: [number, number, number][];
}

interface ManifestVerseTiming {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
  segments?: [number, number, number][];
}

interface Manifest {
  [surahNumber: string]: ManifestVerseTiming[];
}

export interface IAudioTimingService {
  getVerseTimings(
    surahNumber: number,
    reciterId: string,
  ): Promise<VerseTiming[]>;
}

export function findActiveVerse(
  timings: VerseTiming[],
  positionMs: number,
): string | null {
  if (!timings.length) return null;
  let lo = 0;
  let hi = timings.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (positionMs < timings[mid].timestampFrom) hi = mid - 1;
    else if (positionMs >= timings[mid].timestampTo) lo = mid + 1;
    else return timings[mid].verseKey;
  }
  return null;
}

class AudioTimingService implements IAudioTimingService {
  private manifestCache = new Map<string, Manifest>();

  async getVerseTimings(
    surahNumber: number,
    reciterId: string,
  ): Promise<VerseTiming[]> {
    try {
      let manifest = this.manifestCache.get(reciterId);
      if (!manifest) {
        const url = buildManifestUrl(reciterId);
        const response = await fetch(url);
        if (!response.ok) return [];
        manifest = (await response.json()) as Manifest;
        this.manifestCache.set(reciterId, manifest);
      }

      const raw = manifest[String(surahNumber)];
      if (!raw) return [];

      return raw.map((v) => ({
        verseKey: v.verse_key,
        timestampFrom: v.timestamp_from,
        timestampTo: v.timestamp_to,
        segments: v.segments,
      }));
    } catch {
      return [];
    }
  }
}

export const audioTimingService = new AudioTimingService();
