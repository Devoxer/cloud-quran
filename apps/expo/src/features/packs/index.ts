/**
 * Content packs — the public surface of the feature (story 8-2).
 *
 * `lint:layers` rule 4: files inside this feature import each other DIRECTLY (`../lib/…`); only
 * the outside world comes through here.
 *
 * ⚠️ THE MIRROR STORE IS NOT EXPORTED FROM HERE. It lives in `@/stores/packStore` because rule 5
 * forbids any shared-layer module from importing a feature, so a store inside this folder could
 * never be read by one — the same reason `audioPlayerStore` sits outside `features/audio`.
 *
 * ⚠️ NEITHER IS THE DISK MODULE. `features/packs/lib/packStore.ts` writes the filesystem and
 * opens handles; `usePacks` is the only sanctioned way in, so that "one install at a time" and
 * "the store mirrors disk" are properties of the feature rather than of whoever calls it.
 */

export {
  type CatalogueState,
  type DiskState,
  type PackRow,
  type UsePacksOptions,
  type UsePacksResult,
  usePacks,
} from './hooks/usePacks';
export { type CataloguePack } from './lib/catalogue';
export { type PackInstallFailure } from './lib/packStore';
