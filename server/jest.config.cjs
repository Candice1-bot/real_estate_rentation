module.exports = {
  preset: "ts-jest/presets/default-esm",

  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
