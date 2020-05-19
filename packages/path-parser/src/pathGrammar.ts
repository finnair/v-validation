// Generated automatically by nearley, version 2.19.2
// http://github.com/Hardmath123/nearley
// Bypasses TS6133. Allow declared but unused functions.
// @ts-ignore
function id(d: any[]): any { return d[0]; }
declare var property: any;
declare var integer: any;
declare var qqString: any;
declare var qString: any;

const moo = require('moo');

const lexer = moo.compile({
  qString: /'(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?'/,
  qqString: /"(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?"/,
  integer: /[0-9]+/,
  property: /[a-zA-Z_][a-zA-Z0-9_]*/,
  '$': '$',
  '[': '[',
  ']': ']',
  '.': '.',
});

function handleQString(qString: string) {
  return JSON.parse('"' + qString.substring(1, qString.length-1) + '"');
}

interface NearleyToken {  value: any;
  [key: string]: any;
};

interface NearleyLexer {
  reset: (chunk: string, info: any) => void;
  next: () => NearleyToken | undefined;
  save: () => any;
  formatError: (token: NearleyToken) => string;
  has: (tokenType: string) => boolean;
};

interface NearleyRule {
  name: string;
  symbols: NearleySymbol[];
  postprocess?: (d: any[], loc?: number, reject?: {}) => any;
};

type NearleySymbol = string | { literal: any } | { test: (token: any) => boolean };

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
    {"name": "Path", "symbols": [{"literal":"$"}, "Path$ebnf$1"], "postprocess": d => d[1].reduce((result: (string | number)[], component: string | number) => result.concat(component), [])},
    {"name": "PathExpression", "symbols": [{"literal":"."}, "PropertyExpression"], "postprocess": d => d[1]},
    {"name": "PathExpression", "symbols": [{"literal":"["}, "IndexExpression", {"literal":"]"}], "postprocess": d => d[1]},
    {"name": "PropertyExpression", "symbols": [(lexer.has("property") ? {type: "property"} : property)], "postprocess": d => d[0].value},
    {"name": "IndexExpression", "symbols": [(lexer.has("integer") ? {type: "integer"} : integer)], "postprocess": d => parseInt(d[0].value)},
    {"name": "IndexExpression", "symbols": [(lexer.has("qqString") ? {type: "qqString"} : qqString)], "postprocess": d => JSON.parse(d[0].value)},
    {"name": "IndexExpression", "symbols": [(lexer.has("qString") ? {type: "qString"} : qString)], "postprocess": d => handleQString(d[0].value)}
  ],
  ParserStart: "Path",
};

export default grammar;
