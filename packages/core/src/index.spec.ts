import { expect, test } from 'vitest';
import { JsonValue as PathJsonValue, JsonObject as PathJsonObject, JsonPrimitive as PathJsonPrimitive } from '@finnair/path';
import { V, assertType, Equals, JsonValue, JsonObject, JsonPrimitive } from './index.js';

test('index coverage', () => expect(V).toBeDefined());

test('JSON types are exported, JsonValue and JsonObject as the same types as in @finnair/path', () => {
  assertType<Equals<JsonValue, PathJsonValue>>(true);
  assertType<Equals<JsonObject, PathJsonObject>>(true);
  assertType<Equals<JsonPrimitive, PathJsonPrimitive>>(true);
});
