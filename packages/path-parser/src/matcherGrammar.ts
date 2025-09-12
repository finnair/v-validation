// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
// Bypasses TS6133. Allow declared but unused functions.
// NOTE: Manually edited to remove dead code
/* v8 ignore next */ // @ts-ignore 
function id(d: any[]): any { return d[0]; }
declare var property: any;
declare var integer: any;
declare var qqString: any;
declare var qString: any;
declare var comma: any;

import * as matchers from '@finnair/path';
import moo from 'moo';

const lexer = moo.compile({
  qString: /'(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?'/,
  qqString: /"(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?"/,
  integer: /[0-9]+/,
  property: /[a-zA-Z_][a-zA-Z0-9_]*/,
  comma: /\s*,\s*/,
  '*': '*',
  '$': '$',
  '[': '[',
  ']': ']',
  '.': '.',
});

function handleQString(qString: string) {
  return JSON.parse('"' + qString.substring(1, qString.length-1) + '"');
}

interface NearleyToken {
  value: any;
  [key: string]: any;
};

interface NearleyLexer {
  reset: (chunk: string, info: any) => void;
  next: () => NearleyToken | undefined;
  save: () => any;
  formatError: (token: never) => string;
  has: (tokenType: string) => boolean;
};

interface NearleyRule {
  name: string;
  symbols: NearleySymbol[];
  postprocess?: (d: any[], loc?: number, reject?: {}) => any;
};

type NearleySymbol = string | { literal: any } | { type: string } | { test: (token: any) => boolean };

interface Grammar {
  Lexer: NearleyLexer | undefined;
  ParserRules: NearleyRule[];
  ParserStart: string;
};

const grammar: Grammar = {
  Lexer: lexer,
  ParserRules: [
    {"name": "Path$ebnf$1", "symbols": []},
    {"name": "Path$ebnf$1", "symbols": ["Path$ebnf$1", "PathExpression"], "postprocess": (d) => d[0].concat([d[1]])},
    {"name": "Path", "symbols": [{"literal":"$"}, "Path$ebnf$1"], "postprocess": d => d[1].reduce((result: any[], matcher: any) => result.concat(matcher), [])},
    {"name": "PathExpression", "symbols": [{"literal":"."}, "PropertyExpression"], "postprocess": d => d[1]},
    {"name": "PathExpression", "symbols": [{"literal":"["}, "IndexExpression", {"literal":"]"}], "postprocess": d => d[1]},
    {"name": "PathExpression", "symbols": [{"literal":"["}, "UnionExpression", {"literal":"]"}], "postprocess": d => new matchers.UnionMatcher(d[1])},
    {"name": "PropertyExpression", "symbols": [{"literal":"*"}], "postprocess": d => matchers.AnyProperty},
    {"name": "PropertyExpression", "symbols": [{type: "property"}], "postprocess": d => new matchers.PropertyMatcher(d[0].value)},
    {"name": "IndexExpression", "symbols": [{type: "integer"}], "postprocess": d => new matchers.IndexMatcher(parseInt(d[0].value))},
    {"name": "IndexExpression", "symbols": [{type: "qqString"}], "postprocess": d => new matchers.PropertyMatcher(JSON.parse(d[0].value))},
    {"name": "IndexExpression", "symbols": [{type: "qString"}], "postprocess": d => new matchers.PropertyMatcher(handleQString(d[0].value))},
    {"name": "IndexExpression", "symbols": [{"literal":"*"}], "postprocess": d => matchers.AnyIndex},
    {"name": "UnionExpression", "symbols": ["ComponentExpression", {type: "comma"}, "ComponentExpression"], "postprocess": d => [d[0], d[2]]},
    {"name": "UnionExpression", "symbols": ["ComponentExpression", {type: "comma"}, "UnionExpression"], "postprocess": d => [ d[0], ...d[2]]},
    {"name": "ComponentExpression", "symbols": [{type: "integer"}], "postprocess": d => parseInt(d[0].value)},
    {"name": "ComponentExpression", "symbols": [{type: "property"}], "postprocess": d => d[0].value},
    {"name": "ComponentExpression", "symbols": [{type: "qqString"}], "postprocess": d => JSON.parse(d[0].value)},
    {"name": "ComponentExpression", "symbols": [{type: "qString"}], "postprocess": d => handleQString(d[0].value)}
  ],
  ParserStart: "Path",
};

export default grammar;
