module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {}],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/seed.ts',
    // 部署入口（等同 main.ts）与一次性脚本（等同 seed.ts），均非单元可测的应用逻辑
    '!src/vercel-entry.ts',
    '!src/scripts/**',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup.ts'],
  // Hard floor so statement coverage can never silently regress below the
  // agreed 90% baseline (TEST-101).
  coverageThreshold: {
    global: {
      statements: 90,
      lines: 90,
      functions: 90,
      branches: 70,
    },
  },
};
