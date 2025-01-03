module.exports = {
  rootDir: './',
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  coverageReporters: ['json', 'lcov', 'text', 'clover', 'cobertura'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  collectCoverageFrom: ['src/**/*service.{ts,js}', '!src/health-check/*.{ts,js}' ],
  testPathIgnorePatterns: ['/node_modules/', '/mocks/', '/dist/'],
};
