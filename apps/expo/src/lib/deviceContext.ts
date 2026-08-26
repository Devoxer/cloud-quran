/**
 * Additive device/app context for Sentry (Story 17.9; PostHog dropped by story 5-2)
 *
 * ONLY fields that @sentry/react-native does NOT already auto-capture. It auto-captures app
 * version, app build number, OS + version, device model/name, and a coarse device-type, so
 * those are deliberately omitted to avoid duplicate tags (the auto-capture vs additive
 * breakdown is the bullet above). Expo SDK module baseline: architecture.md § Core Architectural Decisions.
 */
import * as Application from 'expo-application';
import * as Device from 'expo-device';

export interface DeviceContext {
  /** `false` on a simulator/emulator — lets dashboards filter non-real-device noise. */
  is_physical_device: boolean;
  /** `phone` | `tablet` | `desktop` | `tv` | `unknown` — finer than the SDKs' coarse type. */
  device_type: string;
  /** Total RAM in bytes (perf triage); `null` where unavailable (e.g. web). */
  total_memory_bytes: number | null;
  /** First-install timestamp (ISO 8601) for cohort/age; `null` where unavailable. */
  install_time: string | null;
}

// TELEMETRY TOKENS, not copy. These five values are the `device_type` dimension on Sentry
// events — they are never rendered, and translating them would fragment every breakdown by the
// reporter's UI language. The name trips `lint-i18n` sink 6 (a `…Label` function returning
// literals); this carve-out is the documented answer, not a suppression of a real miss.
// lint-i18n-ok: telemetry dimension, never rendered
function deviceTypeLabel(): string {
  switch (Device.deviceType) {
    case Device.DeviceType.PHONE:
      return 'phone';
    case Device.DeviceType.TABLET:
      return 'tablet';
    case Device.DeviceType.DESKTOP:
      return 'desktop';
    case Device.DeviceType.TV:
      return 'tv';
    default:
      return 'unknown';
  }
}

/**
 * Gathers the additive device/app context. Never throws — any native read that
 * fails (e.g. install time on web) degrades to `null`.
 */
export async function getDeviceContext(): Promise<DeviceContext> {
  let installTime: string | null = null;
  try {
    installTime = (await Application.getInstallationTimeAsync()).toISOString();
  } catch {
    installTime = null;
  }
  return {
    is_physical_device: Device.isDevice,
    device_type: deviceTypeLabel(),
    // `?? null` enforces the documented "null where unavailable" contract even
    // if a runtime hands back `undefined` — this object is serialized to Sentry
    // tags, where undefined vs null diverge.
    total_memory_bytes: Device.totalMemory ?? null,
    install_time: installTime,
  };
}
