#!/usr/bin/env bun
/**
 * Desktop build script: Expo Web export → Electron compile → electron-builder → R2 upload
 *
 * Usage: bun run scripts/build-desktop.ts [--skip-upload]
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const EXPO_DIR = path.join(ROOT, 'apps', 'expo');
const DESKTOP_DIR = path.join(ROOT, 'apps', 'desktop');

const skipUpload = process.argv.includes('--skip-upload');

function run(cmd: string, cwd: string): void {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

async function uploadToR2(): Promise<void> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET = process.env.R2_BUCKET || 'cloud-quran-desktop';

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    console.warn(
      '\n⚠️  R2 credentials not set. Skipping upload.',
      '\n   Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY to enable.',
    );
    return;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
  });

  const releaseDir = path.join(DESKTOP_DIR, 'release');
  const extensions = ['.dmg', '.exe', '.AppImage'];
  const platformMap: Record<string, string> = {
    '.dmg': 'mac',
    '.exe': 'win',
    '.AppImage': 'linux',
  };

  const uploadedUrls: Record<string, string> = {};

  for (const ext of extensions) {
    const files = fs
      .readdirSync(releaseDir, { recursive: true })
      .filter((f) => String(f).endsWith(ext));

    for (const file of files) {
      const filePath = path.join(releaseDir, String(file));
      const platform = platformMap[ext];
      const key = `desktop/latest/cloud-quran-${platform}${ext}`;

      console.log(`\n📤 Uploading ${file} → ${key}`);

      const body = fs.readFileSync(filePath);
      await client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: 'application/octet-stream',
        }),
      );

      uploadedUrls[platform] = `https://${R2_BUCKET}.r2.dev/${key}`;
    }
  }

  // Upload version manifest
  const packageJson = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf-8'));

  const manifest = {
    version: packageJson.version,
    urls: {
      mac: uploadedUrls.mac || '',
      win: uploadedUrls.win || '',
      linux: uploadedUrls.linux || '',
    },
  };

  console.log('\n📤 Uploading version.json');
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: 'desktop/latest/version.json',
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
    }),
  );

  console.log('\n✅ All uploads complete');
}

async function main(): Promise<void> {
  console.log('🏗️  Building Cloud Quran Desktop\n');

  // Step 1: Export Expo Web
  console.log('📦 Step 1: Exporting Expo Web build...');
  run('npx expo export --platform web', EXPO_DIR);

  // Step 2: Compile Electron TypeScript
  console.log('\n⚙️  Step 2: Compiling Electron TypeScript...');
  run('npx tsc', DESKTOP_DIR);

  // Step 3: Run electron-builder
  console.log('\n📦 Step 3: Building platform installers...');
  run('npx electron-builder', DESKTOP_DIR);

  // Step 4: Upload to R2
  if (skipUpload) {
    console.log('\n⏭️  Step 4: Skipping R2 upload (--skip-upload)');
  } else {
    console.log('\n☁️  Step 4: Uploading to Cloudflare R2...');
    await uploadToR2();
  }

  console.log('\n✅ Desktop build complete!');
}

main().catch((err) => {
  console.error('\n❌ Build failed:', err);
  process.exit(1);
});
