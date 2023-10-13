import * as matchers from '@finnair/path';
import * as moo from 'moo'

// @ts-ignore
function id(d: any[]): any {
  return d[0];
}
declare var property: any;
declare var integer: any;
declare var qqString: any;
declare var qString: any;

const lexer = moo.compile({
  qString: /'(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?'/,
  qqString: /"(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?"/,
  integer: /[0-9]+/,
  property: /[a-zA-Z_][a-zA-Z0-9_]*/,
  '*': '*',
  $: '$',
  '[': '[',
  ']': ']',
  '.': '.',
  ',': ',',
});

function handleQString(qString: string) {
  return JSON.parse('"' + qString.substring(1, qString.length - 1) + '"');
}

interface NearleyRule {
  name: string;
  symbols: NearleySymbol[];
  postprocess?: (d: any[], loc?: number, reject?: {}) => any;
}

type NearleySymbol = string | { literal: any } | { test: (token: any) => boolean };

interface Grammar {
  Lexer: moo.Lexer | undefined;
  ParserRules: NearleyRule[];
  ParserStart: string;
}

const grammar: Grammar = {
  Lexer: lexer,
  ParserRules: [
    { name: 'Path$ebnf$1', symbols: [] },
    { name: 'Path$ebnf$1', symbols: ['Path$ebnf$1', 'PathExpression'], postprocess: d => d[0].concat([d[1]]) },
    { name: 'Path', symbols: [{ literal: '$' }, 'Path$ebnf$1'], postprocess: d => d[1].reduce((result: any[], matcher: any) => result.concat(matcher), []) },
    { name: 'PathExpression', symbols: [{ literal: '.' }, 'PropertyExpression'], postprocess: d => d[1] },
    { name: 'PathExpression', symbols: [{ literal: '[' }, 'IndexExpression', { literal: ']' }], postprocess: d => d[1] },
    { name: 'PathExpression', symbols: [{ literal: '[' }, 'UnionExpression', { literal: ']' }], postprocess: d => new matchers.UnionMatcher(d[1]) },
    { name: 'PropertyExpression', symbols: [{ literal: '*' }], postprocess: d => matchers.AnyProperty },
    {
      name: 'PropertyExpression',
      symbols: [lexer.has('property') ? { type: 'property' } : property],
      postprocess: d => new matchers.PropertyMatcher(d[0].value),
    },
    {
      name: 'IndexExpression',
      symbols: [lexer.has('integer') ? { type: 'integer' } : integer],
      postprocess: d => new matchers.IndexMatcher(parseInt(d[0].value)),
    },
    {
      name: 'IndexExpression',
      symbols: [lexer.has('qqString') ? { type: 'qqString' } : qqString],
      postprocess: d => new matchers.PropertyMatcher(JSON.parse(d[0].value)),
    },
    {
      name: 'IndexExpression',
      symbols: [lexer.has('qString') ? { type: 'qString' } : qString],
      postprocess: d => new matchers.PropertyMatcher(handleQString(d[0].value)),
    },
    { name: 'IndexExpression', symbols: [{ literal: '*' }], postprocess: d => matchers.AnyIndex },
    { name: 'UnionExpression', symbols: ['ComponentExpression', { literal: ',' }, 'ComponentExpression'], postprocess: d => [d[0], d[2]] },
    { name: 'UnionExpression', symbols: ['ComponentExpression', { literal: ',' }, 'UnionExpression'], postprocess: d => [d[0], ...d[2]] },
    { name: 'ComponentExpression', symbols: [lexer.has('integer') ? { type: 'integer' } : integer], postprocess: d => parseInt(d[0].value) },
    { name: 'ComponentExpression', symbols: [lexer.has('property') ? { type: 'property' } : property], postprocess: d => d[0].value },
    { name: 'ComponentExpression', symbols: [lexer.has('qqString') ? { type: 'qqString' } : qqString], postprocess: d => JSON.parse(d[0].value) },
    { name: 'ComponentExpression', symbols: [lexer.has('qString') ? { type: 'qString' } : qString], postprocess: d => handleQString(d[0].value) },
  ],
  ParserStart: 'Path',
};

export default grammar;
