const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toArabicNumber(num: number): string {
  return String(Math.trunc(Math.abs(num)))
    .split('')
    .map((digit) => ARABIC_DIGITS[parseInt(digit, 10)])
    .join('');
}
