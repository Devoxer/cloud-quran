/**
 * Audio data pipeline for Cloud Quran.
 *
 * Phase 1: Download audio files
 *   - qdc/qdc-padded/legacy: Download per-surah MP3s from QuranicAudio CDN
 *   - everyayah: Download per-verse MP3s from EveryAyah.com, probe durations, concat per-surah
 * Phase 2: Build timing manifests
 *   - qdc/qdc-padded/legacy: Fetch verse timing from QuranCDN API
 *   - everyayah: Generate manifest from probed durations (no API needed)
 * Phase 3: Upload all files to Cloudflare R2 via wrangler
 *
 * Usage:
 *   bun run scripts/prepare-audio.ts                          # Run full pipeline
 *   bun run scripts/prepare-audio.ts --skip-download          # Skip MP3 download (reuse local files)
 *   bun run scripts/prepare-audio.ts --skip-upload            # Skip R2 upload (local-only)
 *   bun run scripts/prepare-audio.ts --reciter abdulbasit     # Run pipeline for a single reciter
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { resolve } from 'path';
import { SURAH_METADATA } from '../packages/quran-data/src/surah-metadata';

const ROOT = resolve(import.meta.dir, '..');
const TMP_DIR = resolve(ROOT, 'tmp/audio');
const BUCKET = 'gp-cdn';
const TOTAL_SURAHS = 114;

interface ReciterConfig {
  id: string;
  slug: string;
  qurancdnId: number | null; // null = no timing data available from QuranCDN
  downloadFormat: 'qdc' | 'qdc-padded' | 'legacy' | 'everyayah';
  everyAyahFolder?: string; // Required when downloadFormat === 'everyayah'
}

const EVERYAYAH_BASE = 'https://everyayah.com/data';
const EVERYAYAH_DELAY_MS = 150; // Throttle: respect EveryAyah (community sadaqah project)
const FFPROBE_WORKERS = 8;

// Reciter config: app ID → download slug → QuranCDN reciter ID (for timing API)
const RECITERS: ReciterConfig[] = [
  // EveryAyah format — per-verse download + ffprobe timing + ffmpeg concat
  // Re-sourced from QDC (9 reciters)
  {
    id: 'alafasy',
    slug: 'mishari_al_afasy/murattal',
    qurancdnId: 7,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Alafasy_128kbps',
  },
  {
    id: 'sudais',
    slug: 'abdurrahmaan_as_sudais/murattal',
    qurancdnId: 3,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Abdurrahmaan_As-Sudais_192kbps',
  },
  {
    id: 'shatri',
    slug: 'abu_bakr_shatri/murattal',
    qurancdnId: 4,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Abu_Bakr_Ash-Shaatree_128kbps',
  },
  {
    id: 'abdulbasit',
    slug: 'abdul_baset/murattal',
    qurancdnId: 2,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Abdul_Basit_Murattal_192kbps',
  },
  {
    id: 'abdulbasit-mujawwad',
    slug: 'abdul_baset/mujawwad',
    qurancdnId: 1,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Abdul_Basit_Mujawwad_128kbps',
  },
  {
    id: 'husary',
    slug: 'khalil_al_husary/murattal',
    qurancdnId: 6,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Husary_128kbps',
  },
  {
    id: 'minshawi',
    slug: 'siddiq_minshawi/murattal',
    qurancdnId: 9,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Minshawy_Murattal_128kbps',
  },
  {
    id: 'rifai',
    slug: 'hani_ar_rifai/murattal',
    qurancdnId: 5,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Hani_Rifai_192kbps',
  },
  {
    id: 'shuraym',
    slug: 'saud_ash-shuraym/murattal',
    qurancdnId: 10,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Saood_ash-Shuraym_128kbps',
  },
  // Re-added with timing (3 reciters — were audio-only in 3-8)
  {
    id: 'ghamidi',
    slug: 'sa3d_al-ghaamidi/complete',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Ghamadi_40kbps',
  },
  {
    id: 'ajmi',
    slug: 'ahmed_ibn_3ali_al-3ajamy',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net',
  },
  {
    id: 'minshawi-mujawwad',
    slug: 'minshawi_mujawwad',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Minshawy_Mujawwad_192kbps',
  },
  // New high-quality 128kbps+ (20 reciters) — slug/qurancdnId unused for everyayah format
  {
    id: 'basfar',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Abdullah_Basfar_192kbps',
  },
  {
    id: 'matroud',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Abdullah_Matroud_128kbps',
  },
  {
    id: 'neana',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Ahmed_Neana_128kbps',
  },
  {
    id: 'alaqimy',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Akram_AlAlaqimy_128kbps',
  },
  {
    id: 'hudhaify',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Hudhaify_128kbps',
  },
  {
    id: 'suesy',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Ali_Hajjaj_AlSuesy_128kbps',
  },
  {
    id: 'qahtanee',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Khaalid_Abdullaah_al-Qahtaanee_192kbps',
  },
  {
    id: 'tablawi',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Mohammad_al_Tablaway_128kbps',
  },
  {
    id: 'abdulkareem',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Muhammad_AbdulKareem_128kbps',
  },
  {
    id: 'ayyoub',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Muhammad_Ayyoub_128kbps',
  },
  {
    id: 'jibreel',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Muhammad_Jibreel_128kbps',
  },
  {
    id: 'qasim',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Muhsin_Al_Qasim_192kbps',
  },
  {
    id: 'qatami',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Nasser_Alqatami_128kbps',
  },
  {
    id: 'sahl',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Sahl_Yassin_128kbps',
  },
  {
    id: 'budair',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Salah_Al_Budair_128kbps',
  },
  {
    id: 'bukhatir',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Salaah_AbdulRahman_Bukhatir_128kbps',
  },
  {
    id: 'salamah',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Yaser_Salamah_128kbps',
  },
  {
    id: 'dussary',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Yasser_Ad-Dussary_128kbps',
  },
  {
    id: 'husary-mujawwad',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Husary_128kbps_Mujawwad',
  },
  {
    id: 'husary-muallim',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Husary_Muallim_128kbps',
  },
  // New lower-bitrate (8 reciters)
  {
    id: 'tunaiji',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'khalefa_al_tunaiji_64kbps',
  },
  {
    id: 'jaber',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Ali_Jaber_64kbps',
  },
  {
    id: 'abbad',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Fares_Abbad_64kbps',
  },
  {
    id: 'sowaid',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Ayman_Sowaid_64kbps',
  },
  {
    id: 'akhdar',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Ibrahim_Akhdar_32kbps',
  },
  // ismail removed: Mustafa_Ismail_48kbps has incomplete coverage on EveryAyah (many surahs 404)
  {
    id: 'mansoori',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'Karim_Mansoori_40kbps',
  },
  {
    id: 'banna',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'mahmoud_ali_al_banna_32kbps',
  },
  {
    id: 'alili',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'everyayah',
    everyAyahFolder: 'aziz_alili_128kbps',
  },
];

const QDC_BASE = 'https://download.quranicaudio.com/qdc';
const LEGACY_BASE = 'https://download.quranicaudio.com/quran';
const TIMING_API_BASE = 'https://api.qurancdn.com/api/qdc/audio/reciters';

// Rate limiting
const API_DELAY_MS = 500;
const MAX_CONCURRENT_DOWNLOADS = 1;

const skipDownload = process.argv.includes('--skip-download');
const skipUpload = process.argv.includes('--skip-upload');

// --reciter filter: support both --reciter=id and --reciter id
const reciterFilter =
  process.argv.find((a) => a.startsWith('--reciter='))?.split('=')[1] ??
  (process.argv.includes('--reciter') ? process.argv[process.argv.indexOf('--reciter') + 1] : null);

const targetReciters = reciterFilter ? RECITERS.filter((r) => r.id === reciterFilter) : RECITERS;

function padSurah(n: number): string {
  return String(n).padStart(3, '0');
}

function padVerse(n: number): string {
  return String(n).padStart(3, '0');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDownloadUrl(reciter: ReciterConfig, surah: number): string {
  if (reciter.downloadFormat === 'qdc') {
    return `${QDC_BASE}/${reciter.slug}/${surah}.mp3`;
  }
  if (reciter.downloadFormat === 'qdc-padded') {
    return `${QDC_BASE}/${reciter.slug}/${padSurah(surah)}.mp3`;
  }
  // Legacy: uses 3-digit padded surah numbers
  return `${LEGACY_BASE}/${reciter.slug}/${padSurah(surah)}.mp3`;
}

// ─── Phase 1: Download MP3s ───────────────────────────────────────────────────

async function downloadFile(url: string, destPath: string, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 min timeout
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      await Bun.write(destPath, buffer);
      return;
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Failed to download ${url} after ${retries} attempts: ${err}`);
      }
      const waitSec = attempt * 5;
      process.stdout.write(` retry ${attempt}/${retries} in ${waitSec}s...`);
      await sleep(waitSec * 1000);
    }
  }
}

// Download per-surah MP3s from QuranicAudio CDN (qdc/qdc-padded/legacy formats)
async function downloadReciterAudio(reciter: ReciterConfig): Promise<void> {
  const dir = resolve(TMP_DIR, reciter.id);
  mkdirSync(dir, { recursive: true });

  const tasks: (() => Promise<void>)[] = [];

  for (let surah = 1; surah <= TOTAL_SURAHS; surah++) {
    const destFile = resolve(dir, `${padSurah(surah)}.mp3`);

    if (existsSync(destFile) && statSync(destFile).size > 0) {
      continue; // Already downloaded and non-empty
    }

    const url = buildDownloadUrl(reciter, surah);
    tasks.push(async () => {
      process.stdout.write(`  Downloading ${reciter.id}/${padSurah(surah)}.mp3...`);
      try {
        await downloadFile(url, destFile);
        process.stdout.write(' done\n');
      } catch (err) {
        process.stdout.write(` ⚠️ SKIPPED (${err instanceof Error ? err.message : err})\n`);
      }
    });
  }

  for (let i = 0; i < tasks.length; i += MAX_CONCURRENT_DOWNLOADS) {
    const batch = tasks.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
    await Promise.all(batch.map((fn) => fn()));
  }
}

// ─── EveryAyah Pipeline ─────────────────────────────────────────────────────

// Download per-verse MP3s from EveryAyah.com for a single surah
async function downloadEveryAyahVerses(
  reciter: ReciterConfig,
  surahNumber: number,
  verseCount: number,
): Promise<void> {
  const versesDir = resolve(TMP_DIR, reciter.id, 'verses');
  mkdirSync(versesDir, { recursive: true });

  const sss = padSurah(surahNumber);

  for (let verse = 1; verse <= verseCount; verse++) {
    const vvv = padVerse(verse);
    const filename = `${sss}${vvv}.mp3`;
    const destPath = resolve(versesDir, filename);

    if (existsSync(destPath) && statSync(destPath).size > 0) continue;

    const url = `${EVERYAYAH_BASE}/${reciter.everyAyahFolder}/${filename}`;
    process.stdout.write(`  Downloading ${reciter.id}/verses/${filename}...`);
    try {
      await downloadFile(url, destPath);
      process.stdout.write(' done\n');
    } catch (err) {
      process.stdout.write(` ⚠️ SKIPPED (${err instanceof Error ? err.message : err})\n`);
    }

    await sleep(EVERYAYAH_DELAY_MS);
  }
}

// Probe duration of a single MP3 file using ffprobe (returns ms)
async function probeVerseDuration(filePath: string): Promise<number> {
  const proc = Bun.spawn(
    [
      'ffprobe',
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const timeout = setTimeout(() => proc.kill(), 30_000);
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  clearTimeout(timeout);
  const durationMs = Math.round(parseFloat(output.trim()) * 1000);
  if (Number.isNaN(durationMs)) {
    throw new Error(`ffprobe returned invalid duration for ${filePath}`);
  }
  return durationMs;
}

// Probe durations of all verses in a surah (parallel, batched)
async function probeAllVerseDurations(
  reciter: ReciterConfig,
  surahNumber: number,
  verseCount: number,
): Promise<number[]> {
  const versesDir = resolve(TMP_DIR, reciter.id, 'verses');
  const sss = padSurah(surahNumber);
  const tasks: (() => Promise<number>)[] = [];

  for (let verse = 1; verse <= verseCount; verse++) {
    const vvv = padVerse(verse);
    const filePath = resolve(versesDir, `${sss}${vvv}.mp3`);
    tasks.push(() => probeVerseDuration(filePath));
  }

  const results: number[] = [];
  for (let i = 0; i < tasks.length; i += FFPROBE_WORKERS) {
    const batch = tasks.slice(i, i + FFPROBE_WORKERS);
    results.push(...(await Promise.all(batch.map((fn) => fn()))));
  }
  return results;
}

// Generate manifest timing entries from probed durations (same schema as QuranCDN)
function generateManifestFromDurations(
  surahNumber: number,
  verseDurations: number[],
): ManifestVerseTiming[] {
  let cumulativeMs = 0;
  return verseDurations.map((durationMs, index) => {
    const entry: ManifestVerseTiming = {
      verse_key: `${surahNumber}:${index + 1}`,
      timestamp_from: cumulativeMs,
      timestamp_to: cumulativeMs + durationMs,
    };
    cumulativeMs += durationMs;
    return entry;
  });
}

// Concatenate per-verse MP3s into a single per-surah MP3 using ffmpeg
async function concatSurah(
  reciter: ReciterConfig,
  surahNumber: number,
  verseCount: number,
): Promise<void> {
  const versesDir = resolve(TMP_DIR, reciter.id, 'verses');
  const sss = padSurah(surahNumber);
  const outputPath = resolve(TMP_DIR, reciter.id, `${sss}.mp3`);
  const filelistPath = resolve(versesDir, `filelist_${sss}.txt`);

  const lines: string[] = [];
  for (let verse = 1; verse <= verseCount; verse++) {
    const vvv = padVerse(verse);
    lines.push(`file '${sss}${vvv}.mp3'`);
  }
  await Bun.write(filelistPath, lines.join('\n'));

  const proc = Bun.spawn(
    ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', filelistPath, '-c', 'copy', outputPath],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: versesDir,
    },
  );
  const timeout = setTimeout(() => proc.kill(), 5 * 60_000);

  const exitCode = await proc.exited;
  clearTimeout(timeout);
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg concat failed for ${reciter.id} surah ${surahNumber}: ${stderr}`);
  }
}

// Full EveryAyah pipeline for one reciter: download verses, probe, concat, build manifest
async function processEveryAyahReciter(reciter: ReciterConfig): Promise<Manifest> {
  if (!reciter.everyAyahFolder) {
    throw new Error(
      `Reciter ${reciter.id} has downloadFormat 'everyayah' but no everyAyahFolder defined`,
    );
  }

  const dir = resolve(TMP_DIR, reciter.id);
  mkdirSync(dir, { recursive: true });

  // Check if already fully processed (all 114 concats + valid manifest with no empty surahs)
  const existingManifestPath = resolve(dir, 'manifest.json');
  if (existsSync(existingManifestPath)) {
    try {
      const existing = JSON.parse(await Bun.file(existingManifestPath).text()) as Manifest;
      const surahKeys = Object.keys(existing);
      const allConcatsExist =
        surahKeys.length === TOTAL_SURAHS &&
        surahKeys.every((s) => existsSync(resolve(dir, `${padSurah(Number(s))}.mp3`)));
      const allSurahsHaveTiming = surahKeys.every((s) => existing[s].length > 0);
      if (allConcatsExist && allSurahsHaveTiming) {
        console.log(`  ✅ ${reciter.id}: already processed (manifest + 114 MP3s valid), skipping`);
        return existing;
      }
    } catch {
      /* invalid manifest, re-process */
    }
  }

  const manifest: Manifest = {};
  const versesDir = resolve(dir, 'verses');

  for (let surah = 1; surah <= TOTAL_SURAHS; surah++) {
    const verseCount = SURAH_METADATA[surah - 1].verseCount;
    const sss = padSurah(surah);
    const outputMp3 = resolve(dir, `${sss}.mp3`);

    // Check if concat already exists AND verse files exist for probing
    const firstVerseFile = resolve(versesDir, `${sss}001.mp3`);
    if (existsSync(outputMp3) && statSync(outputMp3).size > 0 && existsSync(firstVerseFile)) {
      // Concat and verse files both exist — just probe for manifest
      process.stdout.write(`  Surah ${surah}/114: concat exists, probing durations...`);
      const durations = await probeAllVerseDurations(reciter, surah, verseCount);
      manifest[String(surah)] = generateManifestFromDurations(surah, durations);
      process.stdout.write(` ${verseCount} verses\n`);
      continue;
    }

    try {
      // 1a. Download per-verse MP3s
      console.log(`  Surah ${surah}/114: downloading ${verseCount} verses...`);
      await downloadEveryAyahVerses(reciter, surah, verseCount);

      // Verify at least the first verse file was downloaded
      const firstVerse = resolve(versesDir, `${sss}001.mp3`);
      if (!existsSync(firstVerse)) {
        console.log(`  ⚠️ Surah ${surah}/114: no verse files downloaded, skipping`);
        manifest[String(surah)] = [];
        continue;
      }

      // 1b. Probe durations
      process.stdout.write(`  Surah ${surah}/114: probing durations...`);
      const durations = await probeAllVerseDurations(reciter, surah, verseCount);
      process.stdout.write(` done\n`);

      // 1c. Concatenate
      process.stdout.write(`  Surah ${surah}/114: concatenating...`);
      await concatSurah(reciter, surah, verseCount);
      process.stdout.write(` done\n`);

      // Build manifest entry from durations
      manifest[String(surah)] = generateManifestFromDurations(surah, durations);
    } catch (err) {
      console.error(`  ⚠️ Surah ${surah}/114 failed: ${err instanceof Error ? err.message : err}`);
      manifest[String(surah)] = [];
    }
  }

  // Write manifest before cleanup so a crash doesn't lose both verses and manifest
  const manifestPath = resolve(dir, 'manifest.json');
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

  // 1d. Clean up verses directory
  if (existsSync(versesDir)) {
    console.log(`  Cleaning up ${reciter.id}/verses/...`);
    rmSync(versesDir, { recursive: true, force: true });
  }

  return manifest;
}

async function phase1Download(): Promise<void> {
  console.log('\n=== Phase 1: Download audio files ===\n');

  for (const reciter of targetReciters) {
    if (reciter.downloadFormat === 'everyayah') {
      // EveryAyah reciters are handled in phase1+2 combined (processEveryAyahReciter)
      continue;
    }
    console.log(
      `Downloading ${reciter.id} (${reciter.slug}, format: ${reciter.downloadFormat})...`,
    );
    await downloadReciterAudio(reciter);
    console.log(`  ✅ ${reciter.id} complete`);
  }
}

// ─── Phase 2: Fetch timing data & build manifests ─────────────────────────────

interface ManifestVerseTiming {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
  segments?: [number, number, number][];
}

interface Manifest {
  [surahNumber: string]: ManifestVerseTiming[];
}

interface QuranCDNAudioFile {
  verse_timings: {
    verse_key: string;
    timestamp_from: number;
    timestamp_to: number;
    segments: [number, number, number][];
  }[];
}

async function fetchSurahTimings(
  reciterQurancdnId: number,
  surahNumber: number,
  retries = 3,
): Promise<ManifestVerseTiming[]> {
  const url = `${TIMING_API_BASE}/${reciterQurancdnId}/audio_files?chapter=${surahNumber}&segments=true`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as { audio_files: QuranCDNAudioFile[] };
      const audioFile = data.audio_files?.[0];
      if (!audioFile?.verse_timings) return [];

      return audioFile.verse_timings.map((vt) => {
        const entry: ManifestVerseTiming = {
          verse_key: vt.verse_key,
          timestamp_from: vt.timestamp_from,
          timestamp_to: vt.timestamp_to,
        };
        if (vt.segments?.length) {
          entry.segments = vt.segments;
        }
        return entry;
      });
    } catch (err) {
      if (attempt === retries) {
        console.error(
          `  ⚠️ Timing API failed for surah ${surahNumber} after ${retries} attempts: ${err}`,
        );
        return [];
      }
      const waitSec = attempt * 2;
      process.stdout.write(` timing retry ${attempt}/${retries} in ${waitSec}s...`);
      await sleep(waitSec * 1000);
    }
  }
  return [];
}

async function buildManifest(reciter: ReciterConfig): Promise<Manifest> {
  const manifest: Manifest = {};

  for (let surah = 1; surah <= TOTAL_SURAHS; surah++) {
    process.stdout.write(`  Fetching timing for surah ${surah}/114...`);
    const timings = await fetchSurahTimings(reciter.qurancdnId!, surah);
    manifest[String(surah)] = timings;
    process.stdout.write(` ${timings.length} verses\n`);

    // Rate limit
    await sleep(API_DELAY_MS);
  }

  return manifest;
}

async function phase2Manifests(): Promise<void> {
  console.log('\n=== Phase 2: Build timing manifests ===\n');

  for (const reciter of targetReciters) {
    if (reciter.downloadFormat === 'everyayah') {
      // EveryAyah: download + probe + concat + manifest all in one pass
      console.log(`Processing ${reciter.id} (everyayah: ${reciter.everyAyahFolder})...`);
      const manifest = await processEveryAyahReciter(reciter);

      // Validate
      const totalSurahs = Object.keys(manifest).length;
      const emptySurahs = Object.entries(manifest)
        .filter(([, timings]) => timings.length === 0)
        .map(([surah]) => surah);

      if (emptySurahs.length > 0) {
        console.warn(
          `  ⚠️  ${reciter.id}: ${emptySurahs.length}/${totalSurahs} surahs have empty timing data`,
        );
      } else {
        console.log(`  ✅ All ${totalSurahs} surahs have timing data`);
      }

      // Manifest already written to disk inside processEveryAyahReciter (before verse cleanup)
      console.log(`  ✅ Manifest saved for ${reciter.id}`);
      continue;
    }

    if (reciter.qurancdnId === null) {
      console.log(`  ⏭️  ${reciter.id}: no QuranCDN ID, skipping manifest`);
      continue;
    }

    console.log(`Building manifest for ${reciter.id}...`);
    const manifest = await buildManifest(reciter);

    const totalSurahs = Object.keys(manifest).length;
    const emptySurahs = Object.entries(manifest)
      .filter(([, timings]) => timings.length === 0)
      .map(([surah]) => surah);

    if (emptySurahs.length > 0) {
      console.warn(
        `  ⚠️  ${reciter.id}: ${emptySurahs.length}/${totalSurahs} surahs have empty timing data: [${emptySurahs.join(', ')}]`,
      );
    } else {
      console.log(`  ✅ All ${totalSurahs} surahs have timing data`);
    }

    const manifestPath = resolve(TMP_DIR, reciter.id, 'manifest.json');
    await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  ✅ Wrote ${manifestPath}`);
  }
}

// ─── Phase 3: Upload to R2 ───────────────────────────────────────────────────

async function uploadToR2(localPath: string, r2Key: string, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const proc = Bun.spawn(
      [
        'npx',
        'wrangler',
        'r2',
        'object',
        'put',
        `${BUCKET}/${r2Key}`,
        '--file',
        localPath,
        '--remote',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const exitCode = await proc.exited;
    if (exitCode === 0) return;

    const stderr = await new Response(proc.stderr).text();
    if (attempt === retries) {
      throw new Error(`Upload failed for ${r2Key} after ${retries} attempts: ${stderr}`);
    }
    const waitSec = attempt * 5;
    process.stdout.write(` upload retry ${attempt}/${retries} in ${waitSec}s...`);
    await sleep(waitSec * 1000);
  }
}

async function phase3Upload(): Promise<void> {
  console.log('\n=== Phase 3: Upload to R2 ===\n');

  for (const reciter of targetReciters) {
    const dir = resolve(TMP_DIR, reciter.id);
    if (!existsSync(dir)) {
      console.error(`  ❌ Directory not found: ${dir}`);
      continue;
    }

    // Only upload MP3s and manifest.json (skip verses/ directory if it somehow still exists)
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.mp3') || f === 'manifest.json')
      .sort();
    console.log(`Uploading ${reciter.id} (${files.length} files)...`);

    for (const file of files) {
      const localPath = resolve(dir, file);
      const r2Key = `audio/${reciter.id}/${file}`;
      process.stdout.write(`  ${r2Key}...`);
      await uploadToR2(localPath, r2Key);
      process.stdout.write(' ✅\n');
    }

    console.log(`  ✅ ${reciter.id} upload complete`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Cloud Quran Audio Pipeline');
  console.log('=========================');
  console.log(`  Output dir: ${TMP_DIR}`);
  console.log(`  Reciters: ${targetReciters.map((r) => r.id).join(', ')}`);
  console.log(`  Skip download: ${skipDownload}`);
  console.log(`  Skip upload: ${skipUpload}`);
  if (reciterFilter) {
    console.log(`  Filter: --reciter ${reciterFilter}`);
    if (targetReciters.length === 0) {
      console.error(`\n❌ No reciter found with ID "${reciterFilter}"`);
      process.exit(1);
    }
  }

  mkdirSync(TMP_DIR, { recursive: true });

  if (!skipDownload) {
    await phase1Download();
  } else {
    console.log('\n⏭️  Skipping Phase 1 (download) — using existing local files');
  }

  await phase2Manifests();

  if (!skipUpload) {
    await phase3Upload();
  } else {
    console.log('\n⏭️  Skipping Phase 3 (upload) — files remain local only');
  }

  console.log('\n✅ Pipeline complete!');
}

main().catch((err) => {
  console.error('\n❌ Pipeline failed:', err);
  process.exit(1);
});
