// Mock react-native-mmkv before any imports
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: jest.fn(() => undefined),
    set: jest.fn(),
    remove: jest.fn(),
  }),
}));

// Mock react-native AppState
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Platform: { OS: 'ios' },
}));

import { queryClient, queryPersister } from './query-client';

describe('React Query Configuration', () => {
  it('has staleTime set to 5 minutes', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000);
  });

  it('has refetchInterval disabled (no polling)', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchInterval).toBe(false);
  });

  it('has refetchOnReconnect enabled', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });

  it('has refetchOnWindowFocus enabled', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true);
  });

  it('creates a persister', () => {
    expect(queryPersister).toBeDefined();
  });
});
