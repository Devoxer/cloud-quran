/**
 * Audio data pipeline for Cloud Quran.
 *
 * Phase 1: Download audio files
 *   - qdc/qdc-padded/legacy: Download per-surah MP3s from QuranicAudio CDN
 *   - everyayah: Download per-verse MP3s from EveryAyah.com, probe durations, concat per-surah
 *   - quranenc: Download per-ayah narrated translations from d.quranenc.com (story 8-4), same shape
 * Phase 2: Build timing manifests
 *   - qdc/qdc-padded/legacy: Fetch verse timing from QuranCDN API
 *   - everyayah/quranenc: Generate manifest from probed durations (no API needed)
 * Phase 3: Upload all files to Cloudflare R2 via wrangler
 *
 * ⚠️ A NARRATION IS A RECITER, AND THAT IS WHY IT NEEDS NO SECOND ENGINE (story 8-4). QuranEnc
 * publishes narrated translations as one MP3 PER AYAH — the ayah delimiter is the file boundary.
 * So each ayah's duration can be measured exactly, the files concatenated into 114 surah tracks,
 * and the manifest built from the measurements: precisely what the `everyayah` path already does
 * for recitation. On the device a narration voice is 114 surah MP3s plus a 6,236-window manifest
 * under `audio/{id}/` — indistinguishable from a reciter, played by the same engine.
 *
 * Usage:
 *   node scripts/prepare-audio.ts                          # Run full pipeline
 *   node scripts/prepare-audio.ts --skip-download          # Skip MP3 download (reuse local files)
 *   node scripts/prepare-audio.ts --skip-upload            # Skip R2 upload (local-only)
 *   node scripts/prepare-audio.ts --reciter abdulbasit     # Run pipeline for a single reciter
 */

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURAH_METADATA } from '../packages/quran-data/src/surah-metadata.ts';

const ROOT = resolve(import.meta.dirname, '..');
const TMP_DIR = resolve(ROOT, 'tmp/audio');
const BUCKET = 'gp-cdn';
const TOTAL_SURAHS = 114;

interface ReciterConfig {
  id: string;
  slug: string;
  qurancdnId: number | null; // null = no timing data available from QuranCDN
  downloadFormat: 'qdc' | 'qdc-padded' | 'legacy' | 'everyayah' | 'quranenc';
  everyAyahFolder?: string; // Required when downloadFormat === 'everyayah'
  quranEncKey?: string; // Required when downloadFormat === 'quranenc'
}

/** Per-ayah narration files: `{base}/{key}/{SSS}{VVV}.mp3` (measured 2026-09-20). */
const QURANENC_AUDIO_BASE = 'https://d.quranenc.com/data/audio';
/**
 * How many narration files are fetched at once. ⚠️ BOUNDED, NOT 6,236 AT ONCE — QuranEnc is a
 * dawah project serving its own files, and the pipeline is a guest on it. Four keeps a voice to a
 * few minutes on a home connection without ever holding more than four requests open.
 */
const QURANENC_CONCURRENCY = 4;
/**
 * How far a concatenated surah may drift from the sum of its measured ayat before it is refused.
 * The highlight is placed by those sums; a surah whose real length disagrees by more than this
 * would light the wrong ayah by its end.
 */
const QURANENC_MAX_DRIFT_MS = 1000;

const EVERYAYAH_BASE = 'https://everyayah.com/data';
const EVERYAYAH_DELAY_MS = 150; // Throttle: respect EveryAyah (community sadaqah project)
const FFPROBE_WORKERS = 8;

// Reciter config: app ID → download slug → QuranCDN reciter ID (for timing API)
const RECITERS: ReciterConfig[] = [
  // EveryAyah format — per-verse download + ffprobe timing + ffmpeg concat
  // Re-sourced from QDC (9 reciters)
  /**
   * ⚠️ `qdc`, NOT `everyayah`, AND THE MISMATCH IS WHAT BROKE IT (measured 2026-09-08). The MP3s
   * published for this reciter are QuranicAudio's own surah files — byte-identical to
   * `${QDC_BASE}/mishari_al_afasy/murattal/{n}.mp3` — but the manifest beside them had been built
   * from EveryAyah's per-verse durations, i.e. timings for a DIFFERENT recording. Two defects
   * followed: 1,125 of 6,236 windows published as `null` (37 surahs, Ya-Sin 2 of 83), and a ~0.7%
   * compression in the rest, so the highlight ran progressively ahead of the audio — 326ms adrift
   * by the end of Al-Fatihah alone. The QuranCDN timing API times exactly the file we serve and
   * now returns zero nulls, so this reciter's manifest comes from there. Keep the two halves on
   * ONE source: a `qdc` reciter takes QuranicAudio audio and QuranCDN timings, together.
   */
  {
    id: 'alafasy',
    slug: 'mishari_al_afasy/murattal',
    qurancdnId: 7,
    downloadFormat: 'qdc',
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
  /**
   * ⚠️ `abdulkareem` (`Muhammad_AbdulKareem_128kbps`) IS DELETED, AND RE-ADDING IT WILL NOT WORK
   * (owner call, 2026-09-08). Its published audio was truncated — Al-Baqarah ended at verse 55,
   * Ar-Rum at 11, Ash-Shu'ara at 199 — because the concat below used to skip failed verse
   * downloads. With that gate failing closed the rebuild refused exactly those three surahs:
   * EveryAyah serves `002056.mp3`, `026200.mp3` and `030012.mp3` with an ID3 header and no
   * decodable audio, so ffprobe rejects them and there is nothing to concatenate. The reciter
   * comes back only if those three verses are sourced somewhere else — not by re-running this.
   */
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
  /**
   * Narrated translations (story 8-4) — the 13 QuranEnc editions whose per-ayah audio answers 200
   * (measured 2026-09-20; the other 62 answer 301 to a 404 page). Each is published ONLY when all
   * 6,236 source files fetch and decode — see `processQuranEncNarration`.
   */
  /**
   * ⚠️ `narration-en-rwwad` (`english_rwwad`) IS NOT PUBLISHED, AND RE-ADDING IT WILL NOT WORK YET
   * (measured 2026-09-29). The completeness gate refused it: `017069.mp3` — Al-Isra 17:69 — answers
   * 301 to QuranEnc's 404 page, while 17:68 and 17:70 answer 200. 6,235 of 6,236 is a narration
   * with a hole in it, and the frozen rule is that such an edition is not a voice. It comes back
   * when QuranEnc serves that ayah; re-probe with `curl -sI` before re-adding it here and in
   * `apps/expo/src/features/audio/data/reciters.ts`.
   */
  {
    id: 'narration-fr-rashid',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'french_rashid',
  },
  {
    id: 'narration-pt-nasr',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'portuguese_nasr',
  },
  {
    id: 'narration-nl-center',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'dutch_center',
  },
  /**
   * ⚠️ `narration-az-musayev` (`azeri_musayev`) IS NOT PUBLISHED either (measured 2026-09-29).
   * QuranEnc serves it through 51:47 and nothing after: 51:48 to 114:6 — 1,514 ayat — answer 301
   * to the 404 page. The edition is not finished upstream, so it is not a voice. Re-probe the last
   * ayah (`114006.mp3`) with `curl -sI` before re-adding it here and in `reciters.ts`.
   */
  {
    id: 'narration-tl-rwwad',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'tagalog_rwwad',
  },
  {
    id: 'narration-zh-suliman',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'chinese_suliman',
  },
  {
    id: 'narration-vi-rwwad',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'vietnamese_rwwad',
  },
  {
    id: 'narration-fa-ih',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'persian_ih',
  },
  {
    id: 'narration-as-rafeeq',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'assamese_rafeeq',
  },
  {
    id: 'narration-ta-omar-brief',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'tamil_omar_brief',
  },
  {
    id: 'narration-si-mahir',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'sinhalese_mahir',
  },
  {
    id: 'narration-so-yacob',
    slug: '',
    qurancdnId: null,
    downloadFormat: 'quranenc',
    quranEncKey: 'somali_yacob',
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

/** Voices refused this run — never uploaded, and the run exits non-zero. See phase 2. */
const refused = new Map<string, string>();

function padSurah(n: number): string {
  return String(n).padStart(3, '0');
}

function padVerse(n: number): string {
  return String(n).padStart(3, '0');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a child process to completion and return its exit code and captured
 * output. stdout/stderr are drained as they arrive: reading them only after
 * the process exits (as the Bun version did) deadlocks once a chatty tool like
 * ffmpeg fills the 64 KB pipe buffer.
 */
async function run(
  argv: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const [command, ...args] = argv;
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  const timer = opts.timeoutMs ? setTimeout(() => child.kill(), opts.timeoutMs) : undefined;
  try {
    const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
      child.once('error', rejectPromise);
      child.once('close', (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
    });
    return {
      exitCode,
      stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
      stderr: Buffer.concat(stderrChunks).toString('utf-8'),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
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
        const error = new Error(`HTTP ${response.status} ${response.statusText}`);
        // A 4xx is an answer, not a hiccup: retrying it only repeats the request. QuranEnc's
        // missing ayat answer 301 → 404, and retrying each of `azeri_musayev`'s 1,514 missing files
        // turned a four-minute run into an hour of requests against a host we are a guest on.
        if (response.status >= 400 && response.status < 500)
          throw Object.assign(error, { final: true });
        throw error;
      }
      const buffer = await response.arrayBuffer();
      writeFileSync(destPath, Buffer.from(buffer));
      return;
    } catch (err) {
      if ((err as { final?: boolean }).final) {
        throw new Error(`Failed to download ${url}: ${(err as Error).message}`);
      }
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
  verseCount: number
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
  const { stdout } = await run(
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
    { timeoutMs: 30_000 }
  );
  const durationMs = Math.round(parseFloat(stdout.trim()) * 1000);
  if (Number.isNaN(durationMs)) {
    throw new Error(`ffprobe returned invalid duration for ${filePath}`);
  }
  return durationMs;
}

/**
 * The length of a file's AUDIO PACKETS, in ms — what a stream-copy concat actually contributes.
 *
 * ⚠️ NOT `format=duration`, AND THE DIFFERENCE IS 9.7 SECONDS BY THE END OF AL-BAQARAH (measured on
 * `french_rashid`, 2026-09-29). `format=duration` honours each file's LAME gapless tag and trims
 * the encoder delay and padding — ~14.5ms of silence per file. `ffmpeg -f concat -c copy` copies
 * whole frames, so every one of those milliseconds IS in the surah track: 286 ayat measured by
 * format duration summed to 4,249,269ms, the concatenated track was 4,258,978ms, and a manifest
 * built from the smaller numbers would light each ayah progressively EARLY. The packet sum of ten
 * files matched their concatenation to within a millisecond, so the manifest is built from it.
 */
async function probePacketDuration(filePath: string): Promise<number> {
  const { stdout, exitCode } = await run(
    [
      'ffprobe',
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'packet=duration_time',
      '-of',
      'csv=p=0',
      filePath,
    ],
    { timeoutMs: 60_000 }
  );
  if (exitCode !== 0) throw new Error(`ffprobe could not read packets of ${filePath}`);
  const seconds = stdout
    .split('\n')
    .map((line) => Number.parseFloat(line))
    .filter((value) => Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
  return Math.round(seconds * 1000);
}

/**
 * Which of a surah's verse files are unusable — the ONE answer to "may this surah be published?".
 *
 * ⚠️ IT IS A HELPER BECAUSE THERE ARE THREE GATES, AND FIXING ONE FIXED NOTHING. The defect that
 * published a 14.3-minute Al-Baqarah was a first-verse-only check; replacing it inline left two
 * siblings deciding the same question the old way — the per-surah resume branch (concat present +
 * verse 1 present → re-probe and keep the EXISTING mp3) and the whole-reciter skip (`length > 0`
 * rather than `length === verseCount`). A re-run over a directory a partial run left behind would
 * then re-publish the truncated audio beside a now-complete manifest, which is worse than the
 * original defect: the two halves would agree.
 *
 * ⚠️ AND IT PROBES, RATHER THAN TRUSTING SIZE. EveryAyah serves `002056`, `026200` and `030012`
 * for `abdulkareem` with a real ID3 header and no decodable audio — non-zero bytes, so any
 * size test passes them. Duration is the only property that answers the question being asked.
 */
async function missingVerses(
  reciter: ReciterConfig,
  surahNumber: number,
  verseCount: number
): Promise<number[]> {
  const versesDir = resolve(TMP_DIR, reciter.id, 'verses');
  const sss = padSurah(surahNumber);
  const missing: number[] = [];
  for (let verse = 1; verse <= verseCount; verse++) {
    const file = resolve(versesDir, `${sss}${padVerse(verse)}.mp3`);
    if (!existsSync(file) || statSync(file).size === 0) {
      missing.push(verse);
      continue;
    }
    try {
      if ((await probeVerseDuration(file)) <= 0) missing.push(verse);
    } catch {
      missing.push(verse);
    }
  }
  return missing;
}

// Probe durations of all verses in a surah (parallel, batched)
async function probeAllVerseDurations(
  reciter: ReciterConfig,
  surahNumber: number,
  verseCount: number
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
  verseDurations: number[]
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
  /**
   * `-map 0:a`: keep only the audio stream (story 8-4). QuranEnc embeds a ~750 KB PNG cover in
   * every ayah file; `-c copy` alone carries it into the output as a video stream. Mapping audio
   * only drops the picture and COPIES the recitation bytes — no re-encode, no modification of the
   * narration. `english_rwwad` measured 5.59 GB with the art, 0.90 GB without.
   */
  audioOnly = false
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
  writeFileSync(filelistPath, lines.join('\n'), 'utf-8');

  const { exitCode, stderr } = await run(
    [
      'ffmpeg',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      filelistPath,
      ...(audioOnly ? ['-map', '0:a'] : []),
      '-c',
      'copy',
      outputPath,
    ],
    { cwd: versesDir, timeoutMs: 5 * 60_000 }
  );
  if (exitCode !== 0) {
    throw new Error(`ffmpeg concat failed for ${reciter.id} surah ${surahNumber}: ${stderr}`);
  }
}

// Full EveryAyah pipeline for one reciter: download verses, probe, concat, build manifest
async function processEveryAyahReciter(reciter: ReciterConfig): Promise<Manifest> {
  if (!reciter.everyAyahFolder) {
    throw new Error(
      `Reciter ${reciter.id} has downloadFormat 'everyayah' but no everyAyahFolder defined`
    );
  }

  const dir = resolve(TMP_DIR, reciter.id);
  mkdirSync(dir, { recursive: true });

  // Check if already fully processed (all 114 concats + valid manifest with no empty surahs)
  const existingManifestPath = resolve(dir, 'manifest.json');
  if (existsSync(existingManifestPath)) {
    try {
      const existing = JSON.parse(readFileSync(existingManifestPath, 'utf-8')) as Manifest;
      const surahKeys = Object.keys(existing);
      const allConcatsExist =
        surahKeys.length === TOTAL_SURAHS &&
        surahKeys.every((s) => existsSync(resolve(dir, `${padSurah(Number(s))}.mp3`)));
      // ⚠️ `length > 0` WAS THE BUG'S ACCOMPLICE — a 55-entry Al-Baqarah is non-empty. Complete
      // means every ayah the surah actually has.
      const allSurahsHaveTiming = surahKeys.every(
        (s) => existing[s].length === SURAH_METADATA[Number(s) - 1]?.verseCount
      );
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

    // ⚠️ THE RESUME BRANCH RUNS THE SAME GATE. Trusting an existing concat because verse 1 is on
    // disk is exactly how a truncated mp3 survives a re-run — and the re-run would pair it with a
    // COMPLETE manifest, so the two halves would agree and nothing downstream could tell.
    const firstVerseFile = resolve(versesDir, `${sss}001.mp3`);
    if (existsSync(outputMp3) && statSync(outputMp3).size > 0 && existsSync(firstVerseFile)) {
      process.stdout.write(`  Surah ${surah}/114: concat exists, verifying verse set...`);
      const missing = await missingVerses(reciter, surah, verseCount);
      if (missing.length === 0) {
        const durations = await probeAllVerseDurations(reciter, surah, verseCount);
        manifest[String(surah)] = generateManifestFromDurations(surah, durations);
        process.stdout.write(` ${verseCount} verses\n`);
        continue;
      }
      // Incomplete: drop the stale concat and fall through to a full re-download.
      process.stdout.write(` ${missing.length} unusable, rebuilding\n`);
      rmSync(outputMp3, { force: true });
    }

    try {
      // 1a. Download per-verse MP3s
      console.log(`  Surah ${surah}/114: downloading ${verseCount} verses...`);
      await downloadEveryAyahVerses(reciter, surah, verseCount);

      /**
       * ⚠️ EVERY VERSE, NOT JUST THE FIRST — THIS GATE SHIPPED TRUNCATED QURAN AUDIO.
       * `downloadEveryAyahVerses` SKIPS a verse whose download fails and logs a warning, so a
       * handful of transient 5xx used to leave a partial verse set that the concat below happily
       * turned into a short MP3 with a matching short manifest — internally consistent, and
       * missing revelation. Measured on `abdulkareem` 2026-09-08: Al-Baqarah published as 14.3
       * minutes ending at verse 55, Ar-Rum as 2.6 minutes ending at verse 11, Ash-Shu'ara ending
       * at 199 — and every gate in this repo was blind to it, because nothing compares a
       * published duration against the surah it claims to be. Refusing the surah outright is the
       * only safe answer: an absent surah is visible, a truncated one is not.
       */
      const missing = await missingVerses(reciter, surah, verseCount);
      if (missing.length > 0) {
        throw new Error(
          `${missing.length}/${verseCount} verse files missing, empty or undecodable (first: ${missing[0]}) — refusing to concatenate a partial surah`
        );
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
      // ⚠️ AND THE STALE CONCAT GOES WITH IT. Leaving a previous run's truncated mp3 on disk
      // hands phase 3 a file to upload for a surah this run just refused — the empty manifest
      // entry would turn highlighting off while the short audio still played.
      rmSync(outputMp3, { force: true });
      manifest[String(surah)] = [];
    }
  }

  // Write manifest before cleanup so a crash doesn't lose both verses and manifest
  const manifestPath = resolve(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // 1d. Clean up verses directory
  if (existsSync(versesDir)) {
    console.log(`  Cleaning up ${reciter.id}/verses/...`);
    rmSync(versesDir, { recursive: true, force: true });
  }

  return manifest;
}

// ─── QuranEnc narration pipeline (story 8-4) ─────────────────────────────────

/** Every ayah of the book as `(surah, verse)`, in order. */
function everyAyah(): { surah: number; verse: number }[] {
  const out: { surah: number; verse: number }[] = [];
  for (let surah = 1; surah <= TOTAL_SURAHS; surah++) {
    for (let verse = 1; verse <= SURAH_METADATA[surah - 1].verseCount; verse++) {
      out.push({ surah, verse });
    }
  }
  return out;
}

/** Run `tasks` with at most `limit` in flight — the upstream throttle. */
async function withConcurrency<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * The ayat a narration cannot be published without, named — the completeness gate's answer.
 *
 * ⚠️ PURE, AND EXPORTED FOR THE REASON `missingVerses` HAS A DOCBLOCK: the refusal is the one
 * property of this pipeline a wrong `if` would silently remove. `durations` holds a measured
 * length in ms per `surah:verse`, or nothing when the file was absent, empty or undecodable.
 */
export function missingAyat(
  durations: ReadonlyMap<string, number>,
  ayat: readonly { surah: number; verse: number }[] = everyAyah()
): string[] {
  return ayat
    .map(({ surah, verse }) => `${surah}:${verse}`)
    .filter((key) => !((durations.get(key) ?? 0) > 0));
}

/**
 * One narrated edition: fetch 6,236 ayat, measure each, refuse unless ALL are usable, then
 * concatenate 114 surah tracks and build the manifest from the measurements.
 *
 * ⚠️ IT FAILS CLOSED FOR THE WHOLE EDITION, NOT PER SURAH. The recitation path publishes an empty
 * manifest entry for a surah it refused; a narration that cannot narrate one ayah is not
 * published at all (the story's frozen rule, and `abdulkareem`'s lesson: an absent voice is
 * visible, a voice with a hole in it is not). The per-ayah files stay on disk after a refusal so
 * a re-run resumes rather than re-fetching 6,000 files.
 */
async function processQuranEncNarration(reciter: ReciterConfig): Promise<Manifest> {
  const key = reciter.quranEncKey;
  if (!key) throw new Error(`Reciter ${reciter.id} is 'quranenc' but names no quranEncKey`);
  const dir = resolve(TMP_DIR, reciter.id);
  const versesDir = resolve(dir, 'verses');
  mkdirSync(versesDir, { recursive: true });
  const ayat = everyAyah();
  const fileOf = (surah: number, verse: number) => `${padSurah(surah)}${padVerse(verse)}.mp3`;

  // 1a. Fetch, bounded. A file already on disk from an earlier run is kept.
  let fetched = 0;
  const failures: string[] = [];
  await withConcurrency(
    QURANENC_CONCURRENCY,
    ayat.map(({ surah, verse }) => async () => {
      const dest = resolve(versesDir, fileOf(surah, verse));
      if (existsSync(dest) && statSync(dest).size > 0) return;
      try {
        await downloadFile(`${QURANENC_AUDIO_BASE}/${key}/${fileOf(surah, verse)}`, dest);
      } catch (err) {
        rmSync(dest, { force: true });
        failures.push(`${surah}:${verse} (${err instanceof Error ? err.message : err})`);
      }
      fetched++;
      if (fetched % 500 === 0) console.log(`  ${reciter.id}: fetched ${fetched} ayat...`);
    })
  );
  if (failures.length > 0)
    console.warn(`  ⚠️  ${failures.length} fetch failure(s), first: ${failures[0]}`);

  // 1b. Measure every file. Duration is the only property that answers "is this ayah here" —
  // a file with a header and no decodable audio passes every size test (`abdulkareem`, 2026-09-08).
  // Measured as the PACKET length, which is what the concat below adds — see `probePacketDuration`.
  console.log(`  ${reciter.id}: probing ${ayat.length} durations...`);
  const durations = new Map<string, number>();
  await withConcurrency(
    FFPROBE_WORKERS,
    ayat.map(({ surah, verse }) => async () => {
      const file = resolve(versesDir, fileOf(surah, verse));
      if (!existsSync(file) || statSync(file).size === 0) return;
      try {
        const ms = await probePacketDuration(file);
        if (ms > 0) durations.set(`${surah}:${verse}`, ms);
      } catch {
        // Undecodable: absent from `durations`, which is what `missingAyat` reads.
      }
    })
  );

  // 1c. THE GATE. Every ayah or nothing.
  const missing = missingAyat(durations, ayat);
  if (missing.length > 0) {
    const shown = missing.slice(0, 40).join(', ');
    throw new Error(
      `${key}: ${missing.length} of ${ayat.length} ayat missing, empty or undecodable — ` +
        `${shown}${missing.length > 40 ? ', …' : ''}. Refusing to publish this narration: a ` +
        'voice with a hole in it is not a narration of the Quran.'
    );
  }

  // 1d. Concatenate (audio stream only — see `concatSurah`) and check each track's real length
  // against the measurements the manifest is about to be built from.
  const manifest: Manifest = {};
  for (let surah = 1; surah <= TOTAL_SURAHS; surah++) {
    const verseCount = SURAH_METADATA[surah - 1].verseCount;
    const surahDurations = Array.from(
      { length: verseCount },
      (_, i) => durations.get(`${surah}:${i + 1}`) as number
    );
    await concatSurah(reciter, surah, verseCount, true);
    const track = resolve(dir, `${padSurah(surah)}.mp3`);
    const measured = surahDurations.reduce((a, b) => a + b, 0);
    const actual = await probePacketDuration(track);
    if (Math.abs(actual - measured) > QURANENC_MAX_DRIFT_MS) {
      rmSync(track, { force: true });
      throw new Error(
        `${key}: surah ${surah} concatenated to ${actual}ms but its ayat measure ${measured}ms. ` +
          'Refusing: the highlight would drift off the narration.'
      );
    }
    manifest[String(surah)] = generateManifestFromDurations(surah, surahDurations);
    if (surah % 10 === 0) console.log(`  ${reciter.id}: ${surah}/114 surahs concatenated`);
  }

  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  // Only after a COMPLETE build: the per-ayah files are the resume point for a refused one.
  rmSync(versesDir, { recursive: true, force: true });
  return manifest;
}

async function phase1Download(): Promise<void> {
  console.log('\n=== Phase 1: Download audio files ===\n');

  for (const reciter of targetReciters) {
    if (reciter.downloadFormat === 'everyayah' || reciter.downloadFormat === 'quranenc') {
      // Per-ayah sources are handled in phase1+2 combined (processEveryAyahReciter /
      // processQuranEncNarration): the download, the measurement and the manifest are one pass.
      continue;
    }
    console.log(
      `Downloading ${reciter.id} (${reciter.slug}, format: ${reciter.downloadFormat})...`
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
  retries = 3
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
          `  ⚠️ Timing API failed for surah ${surahNumber} after ${retries} attempts: ${err}`
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
    if (reciter.downloadFormat === 'quranenc') {
      console.log(`Processing ${reciter.id} (quranenc: ${reciter.quranEncKey})...`);
      try {
        const manifest = await processQuranEncNarration(reciter);
        const windows = Object.values(manifest).reduce((n, timings) => n + timings.length, 0);
        console.log(`  ✅ ${reciter.id}: 114 surah tracks, ${windows} measured windows`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        refused.set(reciter.id, reason);
        console.error(`  ❌ ${reciter.id} REFUSED: ${reason}`);
      }
      continue;
    }

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
          `  ⚠️  ${reciter.id}: ${emptySurahs.length}/${totalSurahs} surahs have empty timing data`
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
        `  ⚠️  ${reciter.id}: ${emptySurahs.length}/${totalSurahs} surahs have empty timing data: [${emptySurahs.join(', ')}]`
      );
    } else {
      console.log(`  ✅ All ${totalSurahs} surahs have timing data`);
    }

    const manifestPath = resolve(TMP_DIR, reciter.id, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`  ✅ Wrote ${manifestPath}`);
  }
}

// ─── Phase 3: Upload to R2 ───────────────────────────────────────────────────

async function uploadToR2(localPath: string, r2Key: string, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const { exitCode, stderr } = await run([
      'npx',
      'wrangler',
      'r2',
      'object',
      'put',
      `${BUCKET}/${r2Key}`,
      '--file',
      localPath,
      '--remote',
    ]);

    if (exitCode === 0) return;

    if (attempt === retries) {
      throw new Error(`Upload failed for ${r2Key} after ${retries} attempts: ${stderr}`);
    }
    const waitSec = attempt * 5;
    process.stdout.write(` upload retry ${attempt}/${retries} in ${waitSec}s...`);
    await sleep(waitSec * 1000);
  }
}

/**
 * ── COST, WRITTEN DOWN BEFORE IT RUNS (AGENTS.md § Cost safety) ─────────────────────────────────
 *
 * Per voice: 114 surah MP3s + 1 manifest = 115 R2 Class A writes. The 13 narration voices are
 * 13 × 115 = 1,495 writes; with the 75 content packs and their catalogue (`prepare-packs.ts`) the
 * story's ceiling is ~1,600 Class A writes, inside R2's free 1M/month. Stored: audio-only
 * narration measures 0.73–1.82 GB per voice, ~15 GB for all 13 ≈ $0.23/month at $0.015/GB. R2
 * egress is free. Upstream: 13 × 6,236 ≈ 81,000 GETs to d.quranenc.com, not billed to us and
 * throttled to `QURANENC_CONCURRENCY` in flight. A re-run of one voice repeats its 115 writes —
 * the upload does not skip — which is the bounded worst case. Nothing here loops unattended: it
 * runs when a human types it, one voice per `--reciter` if they choose.
 *
 * The upload stays on `wrangler r2 object put`; moving to the `cf` CLI is its own change
 * (`_bmad-output/implementation-artifacts/deferred-work.md`).
 */
async function phase3Upload(): Promise<void> {
  console.log('\n=== Phase 3: Upload to R2 ===\n');

  for (const reciter of targetReciters) {
    // ⚠️ A REFUSED VOICE IS NEVER UPLOADED — not its manifest, and not the surah tracks an
    // earlier run may have left on disk. The refusal is the gate; this is where it holds.
    if (refused.has(reciter.id)) {
      console.log(`  ⏭️  ${reciter.id}: refused in phase 2, not uploading`);
      continue;
    }
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

  if (refused.size > 0) {
    console.error(`\n❌ ${refused.size} voice(s) refused and NOT published:`);
    for (const [id, reason] of refused) console.error(`   ${id}: ${reason}`);
    process.exit(1);
  }
  console.log('\n✅ Pipeline complete!');
}

// Only when RUN, never when imported: `missingAyat` is exported for the pipeline's self-test, and
// an import that also ran the pipeline would start downloading audio.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\n❌ Pipeline failed:', err);
    process.exit(1);
  });
}
