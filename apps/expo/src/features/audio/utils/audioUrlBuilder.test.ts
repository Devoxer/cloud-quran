import { buildAudioUrl, buildManifestUrl } from './audioUrlBuilder';

describe('audioUrlBuilder', () => {
  describe('buildAudioUrl', () => {
    it('builds correct URL for single-digit surah', () => {
      expect(buildAudioUrl('alafasy', 1)).toBe(
        'https://cdn.nobleachievements.com/audio/alafasy/001.mp3',
      );
    });

    it('builds correct URL for double-digit surah', () => {
      expect(buildAudioUrl('sudais', 36)).toBe(
        'https://cdn.nobleachievements.com/audio/sudais/036.mp3',
      );
    });

    it('builds correct URL for triple-digit surah', () => {
      expect(buildAudioUrl('shatri', 114)).toBe(
        'https://cdn.nobleachievements.com/audio/shatri/114.mp3',
      );
    });

    it('pads surah number to 3 digits', () => {
      const url = buildAudioUrl('alafasy', 2);
      expect(url).toContain('/002.mp3');
    });

    it('uses reciterId in URL path', () => {
      const url = buildAudioUrl('sudais', 1);
      expect(url).toContain('/audio/sudais/');
    });

    it('throws RangeError for surah number 0', () => {
      expect(() => buildAudioUrl('alafasy', 0)).toThrow(RangeError);
    });

    it('throws RangeError for surah number 115', () => {
      expect(() => buildAudioUrl('alafasy', 115)).toThrow(RangeError);
    });
  });

  describe('buildManifestUrl', () => {
    it('builds correct manifest URL', () => {
      expect(buildManifestUrl('alafasy')).toBe(
        'https://cdn.nobleachievements.com/audio/alafasy/manifest.json',
      );
    });

    it('uses reciterId in URL path', () => {
      const url = buildManifestUrl('sudais');
      expect(url).toContain('/audio/sudais/');
    });
  });
});
