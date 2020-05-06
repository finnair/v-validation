module.exports = {
  preset: 'ts-jest',
  roots: ['.'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(js|ts)$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  modulePathIgnorePatterns: ['/dist/'],
  testPathIgnorePatterns: ['/dist/'],
  coveragePathIgnorePatterns: ['/dist/'],
};
