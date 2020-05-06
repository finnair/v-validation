import nearley from 'nearley';
import matcherGrammar from './matcherGrammar';
import { PathMatcher } from '@finnair/path';

export function parsePathMatcher(str: string): PathMatcher {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(matcherGrammar));
  parser.feed(str);
  if (parser.results[0]) {
    return PathMatcher.of(...parser.results[0]);
  } else {
    throw new Error(`Unrecognized PathMatcher: ${str}`);
  }
}
