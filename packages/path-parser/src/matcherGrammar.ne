# WARNING! This is the original grammar, but the result has been modified for typescript and ESM!

# Usage: https://nearley.js.org/
@preprocessor typescript
@{%
import * as matchers from '@finnair/path';
const moo = require('moo');

const lexer = moo.compile({
  qString: /'(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?'/,
  qqString: /"(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?"/,
  integer: /[0-9]+/,
  property: /[a-zA-Z_][a-zA-Z0-9_]*/,
  '*': '*',
  '$': '$',
  '[': '[',
  ']': ']',
  '.': '.',
  ',': ',',
});

function handleQString(qString: string) {
  return JSON.parse('"' + qString.substring(1, qString.length-1) + '"');
}
%}

@lexer lexer

Path -> "$" PathExpression:* {% d => d[1].reduce((result: any[], matcher: any) => result.concat(matcher), []) %}

PathExpression -> "." PropertyExpression {% d => d[1] %}
  | "[" IndexExpression "]" {% d => d[1] %}
  | "[" UnionExpression "]" {% d => new matchers.UnionMatcher(d[1]) %}

PropertyExpression -> "*" {% d => matchers.AnyProperty %}
  | %property {% d => new matchers.PropertyMatcher(d[0].value) %}

IndexExpression -> %integer {% d => new matchers.IndexMatcher(parseInt(d[0].value)) %}
  | %qqString {% d => new matchers.PropertyMatcher(JSON.parse(d[0].value)) %}
  | %qString {% d => new matchers.PropertyMatcher(handleQString(d[0].value)) %}
  | "*" {% d => matchers.AnyIndex %}
  
UnionExpression -> ComponentExpression "," ComponentExpression {% d => [d[0], d[2]] %}
  | ComponentExpression "," UnionExpression {% d => [ d[0], ...d[2]] %}

ComponentExpression -> %integer {% d => parseInt(d[0].value) %}
  | %property {% d => d[0].value %}
  | %qqString {% d => JSON.parse(d[0].value) %}
  | %qString {% d => handleQString(d[0].value) %}
