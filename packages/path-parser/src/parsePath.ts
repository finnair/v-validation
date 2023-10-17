import { Path } from '@finnair/path';
import nearley from 'nearley';
import pathGrammar from './pathGrammar.js';

export function parsePath(str: string): Path {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(pathGrammar));
  parser.feed(str);
  if (parser.results[0]) {
    return Path.of(...parser.results[0]);
  } else {
    throw new Error(`Unrecognized Path: ${str}`);
  }
}
