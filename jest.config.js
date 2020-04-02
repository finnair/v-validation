module.exports = {
  roots: ['.'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(js|ts)$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  modulePathIgnorePatterns: ['/dist/'],
  testPathIgnorePatterns: ['/dist/'],
  coveragePathIgnorePatterns: ['/dist/'],
};
