import * as Application from 'expo-application';
import { getDeviceContext } from './deviceContext';

jest.mock('expo-application', () => ({
  getInstallationTimeAsync: jest.fn(() => Promise.resolve(new Date('2026-01-01T00:00:00.000Z'))),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
  deviceType: 1, // DeviceType.PHONE
  totalMemory: 4 * 1024 * 1024 * 1024,
  modelName: 'iPhone Test',
  DeviceType: { UNKNOWN: 0, PHONE: 1, TABLET: 2, DESKTOP: 3, TV: 4 },
}));

describe('getDeviceContext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the additive device fields', async () => {
    await expect(getDeviceContext()).resolves.toEqual({
      is_physical_device: true,
      device_type: 'phone',
      total_memory_bytes: 4 * 1024 * 1024 * 1024,
      install_time: '2026-01-01T00:00:00.000Z',
    });
  });

  it('does NOT duplicate fields the SDKs already auto-capture (AC-5)', async () => {
    const ctx = await getDeviceContext();
    expect(Object.keys(ctx).sort()).toEqual([
      'device_type',
      'install_time',
      'is_physical_device',
      'total_memory_bytes',
    ]);
    // None of the Sentry/PostHog auto-captured fields should be present.
    for (const key of [
      'app_version',
      '$app_version',
      'app_build',
      '$app_build',
      'native_build_version',
      'os',
      '$os',
      'os_version',
      '$os_version',
      'device_model',
      '$device_model',
      'modelName',
    ]) {
      expect(ctx).not.toHaveProperty(key);
    }
  });

  it('degrades install_time to null when the native read throws', async () => {
    (Application.getInstallationTimeAsync as jest.Mock).mockRejectedValueOnce(
      new Error('unavailable')
    );
    const ctx = await getDeviceContext();
    expect(ctx.install_time).toBeNull();
    // Other fields still populate.
    expect(ctx.is_physical_device).toBe(true);
  });
});
