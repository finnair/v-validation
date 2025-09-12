# WARNING! This is the original grammar, but the result has been modified for typescript and ESM!
# Dead code fix RegExp replace: \(lexer\.has\("[a-zA-Z]+"\) \? \{type: "([a-zA-Z]+)"\} : [a-zA-Z]+\) => {type: "$1"}
# Unused id-function coverage: /* v8 ignore next */

# Usage: https://nearley.js.org/
@preprocessor typescript
@{%
import moo from 'moo';

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
%}

@lexer lexer

Path -> "$" PathExpression:* {% d => d[1].reduce((result: (string | number)[], component: string | number) => result.concat(component), []) %}

PathExpression -> "." PropertyExpression {% d => d[1] %}
  | "[" IndexExpression "]" {% d => d[1] %}

PropertyExpression -> %property {% d => d[0].value %}

IndexExpression -> %integer {% d => parseInt(d[0].value) %}
  | %qqString {% d => JSON.parse(d[0].value) %}
  | %qString {% d => handleQString(d[0].value) %}
