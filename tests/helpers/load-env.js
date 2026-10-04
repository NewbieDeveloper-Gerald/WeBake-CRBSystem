/**
 * tests/helpers/load-env.js
 * Centralized environment loader for all acceptance and integration test suites.
 */

const path = require('path');
const dotenv = require('dotenv');

const backendEnv = path.resolve(__dirname, '../../backend/.env');
const rootEnv = path.resolve(__dirname, '../../.env');

dotenv.config({ path: backendEnv });
dotenv.config({ path: rootEnv });

module.exports = {
  backendEnv,
  rootEnv
};
