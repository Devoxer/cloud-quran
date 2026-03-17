type ReadingMode = 'reading' | 'mushaf';

export function getDefaultMode(): ReadingMode {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale.startsWith('ar') ? 'mushaf' : 'reading';
  } catch {
    return 'reading';
  }
}
