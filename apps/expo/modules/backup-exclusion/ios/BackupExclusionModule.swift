import ExpoModulesCore

/**
 * BackupExclusion — sets `NSURLIsExcludedFromBackupKey` on a file URL.
 *
 * ⚠️ THIS EXISTS BECAUSE NO CONFIG PLUGIN CAN REACH IT. The flag is a RUNTIME resource value on a
 * RUNTIME-created directory: there is no Info.plist key, no build-time path exclusion, and
 * `expo-file-system@56` exposes no API for it. Downloaded recitation lives in the DOCUMENT
 * directory on purpose — `Paths.cache` is OS-evictable and an evicted download is a broken offline
 * promise — and Apple's iOS Data Storage Guidelines say re-downloadable content in Documents must
 * carry this flag. Up to ~1 GB of MP3s otherwise goes into every iCloud and iTunes backup.
 *
 * ⚠️ APPLE-ONLY, DELIBERATELY. Android needs nothing: `expo-secure-store`'s plugin owns
 * `android:fullBackupContent` / `android:dataExtractionRules` and its rule files are ALLOW-lists
 * (`<include domain="sharedpref" path="."/>`), so `files/` is excluded by construction. A second
 * plugin would have to seize those attributes and restate secure-store's own exclusion to add
 * nothing. The JS side resolves this module optionally and answers `false` where it is absent.
 *
 * ⚠️ THE FLAG ON A DIRECTORY COVERS ITS WHOLE SUBTREE, which is why the caller sets it once on
 * `{document}/audio` rather than per file — per-file would mean one native call per surah on the
 * download path, and a file created later would miss it.
 *
 * `isExcludedFromBackup` exists so the effect is VERIFIABLE on a device. A write-only native call
 * is one nothing can check, and this one has no user-visible symptom when it silently fails.
 */
public class BackupExclusionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackupExclusion")

    // `true` only when the value was actually written. A missing path, a non-file URL or a
    // failed `setResourceValues` all answer `false` — the caller treats that as "not excluded"
    // rather than as an error, because failing here must never stop a download.
    Function("excludeFromBackup") { (uri: String) -> Bool in
      guard var url = URL(string: uri), url.isFileURL else { return false }
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      do {
        try url.setResourceValues(values)
        return true
      } catch {
        return false
      }
    }

    // `nil` when the URL is unusable or the value cannot be read — distinct from `false`, which
    // means the system answered and the path IS in the backup set.
    Function("isExcludedFromBackup") { (uri: String) -> Bool? in
      guard let url = URL(string: uri), url.isFileURL else { return nil }
      return (try? url.resourceValues(forKeys: [.isExcludedFromBackupKey]))?.isExcludedFromBackup
    }
  }
}
