import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

export interface TrackMetadata {
  surahNumber: number;
  reciterId: string;
  title?: string;
}

export interface LockScreenMetadata {
  title: string;
  artist: string;
  albumTitle?: string;
  artworkUrl?: string;
}

export type RemoteCommandHandler = (command: 'play' | 'pause' | 'next' | 'previous') => void;

export interface IAudioService {
  play(): Promise<void>;
  pause(): Promise<void>;
  seekToPosition(positionMs: number): Promise<void>;
  loadTrack(uri: string, metadata?: TrackMetadata): Promise<void>;
  setPlaybackSpeed(rate: number): Promise<void>;
  getCurrentPositionMs(): number;
  setLockScreenActive(active: boolean, metadata?: LockScreenMetadata): void;
  updateLockScreenInfo(metadata: LockScreenMetadata): void;
  onRemoteCommand(handler: RemoteCommandHandler): void;
  dispose(): void;
}

type StatusListener = (status: {
  isPlaying: boolean;
  isBuffering: boolean;
  positionMs: number;
  durationMs: number;
}) => void;

class ExpoAudioService implements IAudioService {
  private player: ReturnType<typeof createAudioPlayer> | null = null;
  private statusListener: StatusListener | null = null;
  private remoteCommandHandler: RemoteCommandHandler | null = null;
  private currentPositionMs = 0;
  private initialized = false;
  private lockScreenActive = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
    this.player = createAudioPlayer();
    this.registerPlayerListener();
    this.initialized = true;
  }

  private registerPlayerListener(): void {
    if (!this.player) return;
    this.player.addListener('playbackStatusUpdate', (status) => {
      const positionMs = (status.currentTime ?? 0) * 1000;
      const durationMs = (status.duration ?? 0) * 1000;
      this.currentPositionMs = positionMs;
      this.statusListener?.({
        isPlaying: status.playing,
        isBuffering: !status.isLoaded,
        positionMs,
        durationMs,
      });
    });
  }

  onStatusUpdate(listener: StatusListener): void {
    this.statusListener = listener;
  }

  async play(): Promise<void> {
    await this.ensureInit();
    this.player!.play();
  }

  async pause(): Promise<void> {
    this.player?.pause();
  }

  async seekToPosition(positionMs: number): Promise<void> {
    await this.ensureInit();
    this.player!.seekTo(positionMs / 1000);
  }

  async loadTrack(uri: string, _metadata?: TrackMetadata): Promise<void> {
    await this.ensureInit();
    // Recreate player with the new source — iOS AVPlayer can fail silently
    // when replace() is called on a player originally created with null source
    if (this.player) {
      this.player.remove();
    }
    this.player = createAudioPlayer(uri);
    this.registerPlayerListener();
  }

  async setPlaybackSpeed(rate: number): Promise<void> {
    await this.ensureInit();
    this.player!.setPlaybackRate(rate);
  }

  getCurrentPositionMs(): number {
    return this.currentPositionMs;
  }

  setLockScreenActive(active: boolean, metadata?: LockScreenMetadata): void {
    this.lockScreenActive = active;
    if (Platform.OS === 'web') {
      this.setWebMediaSession(active, metadata);
      return;
    }
    // Native lock screen integration — gracefully degrade if API unavailable
    try {
      if (this.player && typeof (this.player as any).setActiveForLockScreen === 'function') {
        if (active && metadata) {
          (this.player as any).setActiveForLockScreen(true, {
            title: metadata.title,
            artist: metadata.artist,
            albumTitle: metadata.albumTitle,
            artworkUrl: metadata.artworkUrl,
          });
        } else {
          (this.player as any).setActiveForLockScreen(false);
        }
      }
    } catch {
      // Lock screen controls unavailable — audio still plays
    }
  }

  updateLockScreenInfo(metadata: LockScreenMetadata): void {
    if (!this.lockScreenActive) return;
    if (Platform.OS === 'web') {
      this.setWebMediaSession(true, metadata);
      return;
    }
    try {
      if (this.player && typeof (this.player as any).updateLockScreenMetadata === 'function') {
        (this.player as any).updateLockScreenMetadata({
          title: metadata.title,
          artist: metadata.artist,
          albumTitle: metadata.albumTitle,
          artworkUrl: metadata.artworkUrl,
        });
      }
    } catch {
      // Lock screen metadata update unavailable — non-critical
    }
  }

  onRemoteCommand(handler: RemoteCommandHandler): void {
    this.remoteCommandHandler = handler;
    if (Platform.OS === 'web') {
      this.setupWebRemoteHandlers(handler);
    }
    // TODO: Wire native remote command listeners for next/previous verse skip.
    // expo-audio handles play/pause automatically via setActiveForLockScreen.
    // Next/previous track events need explicit registration — verify expo-audio
    // SDK 55 event API and wire handlers here for native platforms.
  }

  dispose(): void {
    if (this.lockScreenActive) {
      this.setLockScreenActive(false);
    }
    if (this.player) {
      this.player.remove();
      this.player = null;
    }
    // Keep statusListener and remoteCommandHandler — they're owned by the store
    // and must persist across player lifecycle (play→dispose→loadTrack→play).
    this.initialized = false;
    this.currentPositionMs = 0;
    this.lockScreenActive = false;
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private setWebMediaSession(active: boolean, metadata?: LockScreenMetadata): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (active && metadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.albumTitle ?? 'Cloud Quran',
        artwork: metadata.artworkUrl
          ? [
              {
                src: metadata.artworkUrl,
                sizes: '512x512',
                type: 'image/png',
              },
            ]
          : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  }

  private setupWebRemoteHandlers(handler: RemoteCommandHandler): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => handler('play'));
    navigator.mediaSession.setActionHandler('pause', () => handler('pause'));
    navigator.mediaSession.setActionHandler('nexttrack', () => handler('next'));
    navigator.mediaSession.setActionHandler('previoustrack', () => handler('previous'));
  }
}

export const audioService = new ExpoAudioService();
