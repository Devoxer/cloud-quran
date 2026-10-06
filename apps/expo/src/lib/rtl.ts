/**
 * Interface direction and content alignment. Native direction changes require a reload;
 * web direction is set on the document. The mushaf pager uses native `isRTL()` for its
 * index maths and isolates its web scroll container from the document's direction.
 */
import { reloadAppAsync } from 'expo';
import { I18nManager, Platform } from 'react-native';
import { getLanguage, getStoredLanguage } from './language';
import { createAppMMKV } from './mmkv';

// React Native swaps left/right under native RTL; CSS supports start/end directly.
// The casts accommodate RN's native-only TextStyle union on the web renderer.
export const TEXT_ALIGN_START = Platform.OS === 'web' ? ('start' as 'left') : 'left';
export const TEXT_ALIGN_END = Platform.OS === 'web' ? ('end' as 'right') : 'right';
export const RTL_LANGUAGES: readonly string[] = ['ar'];

export function isRTLLanguage(code: string | undefined | null): boolean {
  return code != null && RTL_LANGUAGES.includes(code);
}

/** Framework direction: RN web's I18nManager stays LTR even with an RTL document. */
export function resolveDirection(code: string | undefined | null): boolean {
  return Platform.OS !== 'web' && isRTLLanguage(code);
}

export function isArabicUi(): boolean {
  return isRTLLanguage(getLanguage());
}

/** FlashList and Yoga use the framework snapshot, including before direction reconciliation. */
export function isRTL(): boolean {
  return Platform.OS !== 'web' && I18nManager.isRTL;
}

/** Navigation glyphs and UI controls follow this on both native and web. */
export function isInterfaceRTL(): boolean {
  return Platform.OS === 'web' ? isArabicUi() : isRTL();
}

/** Content follows its own direction; native text alignment is relative to the interface. */
export function contentTextAlign(contentIsRTL: boolean): 'left' | 'right' {
  if (Platform.OS === 'web') return contentIsRTL ? 'right' : 'left';
  return contentIsRTL === isRTL() ? TEXT_ALIGN_START : TEXT_ALIGN_END;
}

export function isRTLContent(direction: string | null | undefined): boolean {
  return direction === 'rtl';
}

const storage = createAppMMKV('direction');
export const RECONCILED_KEY = 'reconciled-direction';

function writeNativeDirection(rtl: boolean): void {
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}

export function applyWebDirection(code: string | undefined | null): void {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dir = isRTLLanguage(code) ? 'rtl' : 'ltr';
    document.documentElement.lang = code ?? 'en';
  }
}

/** Runs before first render. The durable latch prevents a reload loop on native. */
export function applyStoredDirection(): void {
  const language = getStoredLanguage();
  const desired = resolveDirection(language);
  if (Platform.OS === 'web') {
    applyWebDirection(language);
    return;
  }
  writeNativeDirection(desired);
  if (I18nManager.isRTL === desired) {
    storage.remove(RECONCILED_KEY);
    return;
  }
  if (storage.getString(RECONCILED_KEY) === String(desired)) return;
  storage.set(RECONCILED_KEY, String(desired));
  void reloadAppAsync('Layout direction changed');
}

/** Write the next launch's preference before setLanguage reloads; keep this native tree intact. */
export function applyDirectionForLanguage(code: string | undefined | null): void {
  if (Platform.OS === 'web') applyWebDirection(code);
  else writeNativeDirection(resolveDirection(code));
}
