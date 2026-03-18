jest.mock('better-auth/react', () => ({
  createAuthClient: jest.fn((config) => ({
    _config: config,
    signIn: {
      magicLink: jest.fn(),
      social: jest.fn(),
    },
    signOut: jest.fn(),
    getSession: jest.fn(),
    magicLink: {
      verify: jest.fn(),
    },
  })),
}));

jest.mock('better-auth/client/plugins', () => ({
  anonymousClient: jest.fn(() => ({ id: 'anonymous' })),
  magicLinkClient: jest.fn(() => ({ id: 'magic-link' })),
}));

const { authClient } = require('./auth-client');

describe('auth-client', () => {
  test('creates client with correct baseURL', () => {
    expect(authClient._config.baseURL).toContain('/api/auth');
  });

  test('includes anonymous and magicLink plugins', () => {
    expect(authClient._config.plugins).toHaveLength(2);
    expect(authClient._config.plugins[0].id).toBe('anonymous');
    expect(authClient._config.plugins[1].id).toBe('magic-link');
  });

  test('exposes signIn methods', () => {
    expect(authClient.signIn.magicLink).toBeDefined();
    expect(authClient.signIn.social).toBeDefined();
  });

  test('exposes signOut method', () => {
    expect(authClient.signOut).toBeDefined();
  });
});
