import NetInfo from '@react-native-community/netinfo';
import { act, renderHook } from '@testing-library/react-native';
import { useConnectivity } from './connectivity';

// Control netinfo directly so we can drive the connectivity state. (The global
// jest.setup mock is replaced here; InstantDB isn't exercised in this suite.)
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
  fetch: jest.fn(() => Promise.resolve({ isConnected: null, isInternetReachable: null })),
}));

type Listener = (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) => void;

/**
 * Hands back both halves of the subscription: the captured listener (to drive events) and the
 * unsubscribe mock `addEventListener` returned (to assert teardown). Story 24.22 Step G — the
 * suite previously discarded the unsubscribe, so it stayed green with the hook's cleanup deleted.
 */
function captureSubscription(): { listener: () => Listener; unsubscribe: jest.Mock } {
  let listener: Listener = () => {};
  const unsubscribe = jest.fn();
  (NetInfo.addEventListener as jest.Mock).mockImplementation((cb: Listener) => {
    listener = cb;
    return unsubscribe;
  });
  return { listener: () => listener, unsubscribe };
}

describe('useConnectivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: null,
      isInternetReachable: null,
    });
  });

  it('reports an unknown state before any netinfo event arrives', async () => {
    captureSubscription();
    const { result } = renderHook(() => useConnectivity());
    // Flush the seeding fetch (which resolves to the same unknown state) so it settles inside act()
    // rather than warning after the test body.
    await act(async () => {});
    expect(result.current.isConnected).toBeNull();
    expect(result.current.isInternetReachable).toBeNull();
  });

  // Story 24.22 Step G — the hook seeds from NetInfo.fetch() as well as the listener; netinfo only
  // emits on CHANGE, so on a screen mounted over an already-established connection this is the only
  // thing that resolves the state at all. The suite asserted nothing here, and the default mock
  // resolved to the hook's own initial value, so the branch could be deleted wholesale and every
  // test still passed. Give it a value the initial state cannot produce.
  it('seeds state from the initial fetch when no event has fired', async () => {
    captureSubscription();
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });

    const { result } = renderHook(() => useConnectivity());
    await act(async () => {});

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isInternetReachable).toBe(true);
  });

  it('reports connected when the device reports a connection', () => {
    const { listener } = captureSubscription();
    const { result } = renderHook(() => useConnectivity());
    act(() => listener()({ isConnected: true, isInternetReachable: true }));
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isInternetReachable).toBe(true);
  });

  it('reports disconnected when the device is offline', () => {
    const { listener } = captureSubscription();
    const { result } = renderHook(() => useConnectivity());
    act(() => listener()({ isConnected: false, isInternetReachable: false }));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isInternetReachable).toBe(false);
  });

  // Story 24.22 Step G — the captive-portal state. No case gave the two fields divergent values, so
  // aliasing isInternetReachable to isConnected kept the suite green even though the distinction is
  // the whole reason both fields exist (a hotel wifi is connected and unreachable).
  it('keeps isInternetReachable independent of isConnected', () => {
    const { listener } = captureSubscription();
    const { result } = renderHook(() => useConnectivity());
    act(() => listener()({ isConnected: true, isInternetReachable: false }));
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isInternetReachable).toBe(false);
  });

  it('reports null again when the connection state becomes unknown', () => {
    const { listener } = captureSubscription();
    const { result } = renderHook(() => useConnectivity());
    act(() => listener()({ isConnected: true, isInternetReachable: true }));
    act(() => listener()({ isConnected: null, isInternetReachable: null }));
    expect(result.current.isConnected).toBeNull();
    expect(result.current.isInternetReachable).toBeNull();
  });

  // Story 24.22 Step G — without this the hook could return no cleanup at all and the suite stayed
  // green, leaking a netinfo listener per mount for the lifetime of the app.
  it('unsubscribes from netinfo on unmount', () => {
    const { unsubscribe } = captureSubscription();
    const { unmount } = renderHook(() => useConnectivity());
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  // The seed-vs-event race. netinfo only emits on CHANGE, so if the in-flight fetch resolves on top
  // of a newer event the hook stays pinned to the stale value until the next transition — the app
  // reports online while the device is offline and `useNetworkFallback` never falls back.
  it('does not let a slow initial fetch overwrite a newer connectivity event', async () => {
    const { listener } = captureSubscription();
    let resolveFetch: (s: unknown) => void = () => {};
    (NetInfo.fetch as jest.Mock).mockReturnValue(
      new Promise((res) => {
        resolveFetch = res;
      })
    );

    const { result } = renderHook(() => useConnectivity());

    // The network drops while the reachability probe is still in flight.
    act(() => listener()({ isConnected: false, isInternetReachable: false }));
    // ...and only then does the probe come back with its pre-drop snapshot.
    await act(async () => {
      resolveFetch({ isConnected: true, isInternetReachable: true });
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isInternetReachable).toBe(false);
  });

  // NOTE: the cleanup also flips `superseded` so a fetch resolving after unmount can't set state.
  // That is deliberately NOT asserted here: React 18+ removed the setState-after-unmount warning, so
  // a test for it passes identically with the guard present or absent — an unfailable assertion is
  // decoration, not coverage (`stack/gates-scanners.md` § "test the negative case").
});
