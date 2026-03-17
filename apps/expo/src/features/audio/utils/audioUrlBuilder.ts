const R2_BASE_URL = 'https://cdn.nobleachievements.com';

export function buildAudioUrl(reciterId: string, surahNumber: number): string {
  if (surahNumber < 1 || surahNumber > 114) {
    throw new RangeError(`Invalid surah number: ${surahNumber}. Must be 1-114.`);
  }
  const paddedSurah = String(surahNumber).padStart(3, '0');
  return `${R2_BASE_URL}/audio/${reciterId}/${paddedSurah}.mp3`;
}

export function buildManifestUrl(reciterId: string): string {
  return `${R2_BASE_URL}/audio/${reciterId}/manifest.json`;
}
