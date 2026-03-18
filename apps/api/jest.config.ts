import path from 'node:path';
import type { Config } from 'jest';

const config: Config = {
  displayName: 'api',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'json'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: path.resolve(__dirname, 'tsconfig.json'),
      },
    ],
  },
  transformIgnorePatterns: [
    // Transform ESM-only packages (better-auth, hono, drizzle-orm ship as ESM)
    'node_modules/(?!(better-auth|hono|drizzle-orm|@hono|zod)/)',
  ],
  moduleNameMapper: {
    // Handle .mjs imports
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
  },
};

export default config;
