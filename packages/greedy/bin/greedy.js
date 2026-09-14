#!/usr/bin/env node
import { runGreedy } from '../src/node.js';

try {
  await runGreedy(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode || 1;
}
