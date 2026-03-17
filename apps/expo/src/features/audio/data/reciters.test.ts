import { RECITERS } from './reciters';

describe('RECITERS catalog', () => {
  test('has 40 entries', () => {
    expect(RECITERS).toHaveLength(40);
  });

  test('all entries have required fields populated', () => {
    for (const reciter of RECITERS) {
      expect(reciter.id).toBeTruthy();
      expect(reciter.nameArabic).toBeTruthy();
      expect(reciter.nameEnglish).toBeTruthy();
      expect(['murattal', 'mujawwad', 'muallim']).toContain(reciter.style);
      expect(typeof reciter.hasTimingData).toBe('boolean');
    }
  });

  test('all IDs are unique', () => {
    const ids = RECITERS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('includes murattal, mujawwad, and muallim styles', () => {
    const styles = new Set(RECITERS.map((r) => r.style));
    expect(styles).toContain('murattal');
    expect(styles).toContain('mujawwad');
    expect(styles).toContain('muallim');
  });

  test('all reciters have timing data', () => {
    const noTiming = RECITERS.filter((r) => !r.hasTimingData);
    expect(noTiming).toHaveLength(0);
  });

  test('sections are ordered: murattal, then mujawwad, then muallim', () => {
    const firstMujawwadIndex = RECITERS.findIndex((r) => r.style === 'mujawwad');
    const lastMurattalIndex =
      RECITERS.length - 1 - [...RECITERS].reverse().findIndex((r) => r.style === 'murattal');
    const firstMuallimIndex = RECITERS.findIndex((r) => r.style === 'muallim');
    const lastMujawwadIndex =
      RECITERS.length - 1 - [...RECITERS].reverse().findIndex((r) => r.style === 'mujawwad');

    expect(lastMurattalIndex).toBeLessThan(firstMujawwadIndex);
    expect(lastMujawwadIndex).toBeLessThan(firstMuallimIndex);
  });

  test('murattal reciters are sorted alphabetically by English name', () => {
    const murattal = RECITERS.filter((r) => r.style === 'murattal');
    const names = murattal.map((r) => r.nameEnglish);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('mujawwad reciters are sorted alphabetically by English name', () => {
    const mujawwad = RECITERS.filter((r) => r.style === 'mujawwad');
    const names = mujawwad.map((r) => r.nameEnglish);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('muallim reciters are sorted alphabetically by English name', () => {
    const muallim = RECITERS.filter((r) => r.style === 'muallim');
    const names = muallim.map((r) => r.nameEnglish);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('original 3 reciters are present with timing data', () => {
    const originals = ['alafasy', 'sudais', 'shatri'];
    for (const id of originals) {
      const reciter = RECITERS.find((r) => r.id === id);
      expect(reciter).toBeDefined();
      expect(reciter!.hasTimingData).toBe(true);
    }
  });

  test('muaiqly is removed from catalog', () => {
    const muaiqly = RECITERS.find((r) => r.id === 'muaiqly');
    expect(muaiqly).toBeUndefined();
  });

  test('ismail is removed from catalog', () => {
    const ismail = RECITERS.find((r) => r.id === 'ismail');
    expect(ismail).toBeUndefined();
  });

  test('formerly no-sync reciters now have timing data', () => {
    const formerNoSync = ['ghamidi', 'ajmi', 'minshawi-mujawwad'];
    for (const id of formerNoSync) {
      const reciter = RECITERS.find((r) => r.id === id);
      expect(reciter).toBeDefined();
      expect(reciter!.hasTimingData).toBe(true);
    }
  });
});
