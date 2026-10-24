/** Component tests run on jest-expo; `vitest` keeps the pure helper tests. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest/style-mock.js',
    '^@expo/vector-icons$': '<rootDir>/jest/vector-icons-mock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/components/**/*.tsx'],
};
