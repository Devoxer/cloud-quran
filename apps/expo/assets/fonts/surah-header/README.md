The two themeable surah bands derive from QUL font resource 458, `QCF_SurahHeader_COLOR-Regular.ttf` (King Fahd Glorious Quran Printing Complex). Source: [QUL fonts](https://qul.tarteel.ai/resources/fonts). Retrieved from the project's authenticated QUL cache on 2026-10-05; the ligature map covers all 114 surahs.

Reproduce with `python3 scripts/build-surah-header-fonts.py` and fontTools installed. The source font and `header-lig.dl` belong in `build/qul-cache/font/`; the script writes these bundled fonts and `src/constants/surah-header.ts`.

Line work uses COLR palette entries 13 and 19. Accent ornament uses 10, 11 and 16. Entry 18's white backing is omitted so the page colour remains visible. Private-use aliases E001–E072 avoid browser decomposition of Arabic presentation-form codepoints. The Quran's text, page fonts and layout data remain separate.
