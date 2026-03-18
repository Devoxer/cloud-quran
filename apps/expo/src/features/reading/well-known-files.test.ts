const fs = require('fs');
const path = require('path');

const marketingPublicDir = path.resolve(__dirname, '../../../../marketing/public');

describe('.well-known/apple-app-site-association', () => {
  const filePath = path.join(marketingPublicDir, '.well-known', 'apple-app-site-association');

  test('file exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('is valid JSON', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  test('has correct applinks structure', () => {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content).toHaveProperty('applinks');
    expect(content.applinks).toHaveProperty('apps');
    expect(content.applinks.apps).toEqual([]);
    expect(content.applinks).toHaveProperty('details');
    expect(Array.isArray(content.applinks.details)).toBe(true);
  });

  test('appID matches team ID and bundle identifier', () => {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const detail = content.applinks.details[0];
    expect(detail.appID).toBe('MA2HBUUNVP.com.devoxer.cloud-quran');
  });

  test('path pattern only matches /quran/*/*', () => {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const detail = content.applinks.details[0];
    expect(detail.paths).toEqual(['/quran/*/*']);
  });
});

describe('.well-known/assetlinks.json', () => {
  const filePath = path.join(marketingPublicDir, '.well-known', 'assetlinks.json');

  test('file exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('is valid JSON', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  test('has correct relation and target structure', () => {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(Array.isArray(content)).toBe(true);
    const entry = content[0];
    expect(entry.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(entry.target.namespace).toBe('android_app');
  });

  test('package name matches app.json android.package', () => {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content[0].target.package_name).toBe('com.devoxer.cloudquran');
  });

  test('has sha256_cert_fingerprints array', () => {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(Array.isArray(content[0].target.sha256_cert_fingerprints)).toBe(true);
    expect(content[0].target.sha256_cert_fingerprints.length).toBeGreaterThanOrEqual(1);
  });
});
