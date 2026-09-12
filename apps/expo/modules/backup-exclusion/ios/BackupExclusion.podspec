#
# BackupExclusion — the podspec CocoaPods needs to build this local module.
#
# ⚠️ WITHOUT THIS FILE THE MODULE SILENTLY DOES NOT EXIST. `expo-module.config.json` is enough for
# `expo-modules-autolinking search` to FIND the module — it listed it happily — but CocoaPods has
# nothing to compile, `Podfile.lock` gains no entry, the iOS build succeeds, and
# `requireOptionalNativeModule('BackupExclusion')` answers `null` at runtime. Measured on the
# owner's iPhone 2026-09-12: `[audio] backup-excluded=null`, which is the whole reason that
# readback exists.
#
# `s.platforms` must not be stricter than the app's deployment target (`ios.deploymentTarget`,
# 16.4) or `pod install` refuses the dependency.
#
Pod::Spec.new do |s|
  s.name           = 'BackupExclusion'
  s.version        = '1.0.0'
  s.summary        = 'Sets NSURLIsExcludedFromBackupKey on a file URL.'
  s.description    = 'Keeps re-downloadable recitation out of iCloud/iTunes backup, per Apple\'s iOS Data Storage Guidelines.'
  s.author         = 'Cloud Quran'
  s.homepage       = 'https://github.com/Devoxer/cloud-quran'
  s.license        = { :type => 'GPL-3.0' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
