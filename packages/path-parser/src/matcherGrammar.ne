# WARNING! This is the original grammar, but the result has been modified for typescript and ESM!
# Dead code fix RegExp replace: \(lexer\.has\("[a-zA-Z]+"\) \? \{type: "([a-zA-Z]+)"\} : [a-zA-Z]+\) => {type: "$1"}
# Unused id-function coverage: /* v8 ignore next */

# Usage: https://nearley.js.org/
@preprocessor typescript
@{%
import * as matchers from '@finnair/path';
import moo from 'moo';

const lexer = moo.compile({
  qString: /'(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?'/, // single quoted string
  qqString: /"(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*?"/, // double quoted string
  integer: /[0-9]+/,
  property: /[a-zA-Z_][a-zA-Z0-9_]*/,
  comma: /, ?/,
  lbracket: /\[ ?/,
  rbracket: / ?]/,
  '*': '*',
  '$': '$',
  '.': '.',
});

function handleQString(qString: string) {
  return JSON.parse('"' + qString.substring(1, qString.length-1) + '"');
}
%}

@lexer lexer

Path -> "$" PathExpression:* {% d => d[1].reduce((result: any[], matcher: any) => result.concat(matcher), []) %}

PathExpression -> "." PropertyExpression {% d => d[1] %}
  | %lbracket IndexExpression %rbracket {% d => d[1] %}
  | %lbracket UnionExpression %rbracket {% d => new matchers.UnionMatcher(d[1]) %}

PropertyExpression -> "*" {% d => matchers.AnyProperty %}
  | %property {% d => new matchers.PropertyMatcher(d[0].value) %}

IndexExpression -> %integer {% d => new matchers.IndexMatcher(parseInt(d[0].value)) %}
  | %qqString {% d => new matchers.PropertyMatcher(JSON.parse(d[0].value)) %}
  | %qString {% d => new matchers.PropertyMatcher(handleQString(d[0].value)) %}
  | "*" {% d => matchers.AnyIndex %}
  
UnionExpression -> ComponentExpression %comma ComponentExpression {% d => [d[0], d[2]] %}
  | ComponentExpression %comma UnionExpression {% d => [ d[0], ...d[2]] %}

ComponentExpression -> %integer {% d => parseInt(d[0].value) %}
  | %property {% d => d[0].value %}
  | %qqString {% d => JSON.parse(d[0].value) %}
  | %qString {% d => handleQString(d[0].value) %}
