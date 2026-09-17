import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../lib/slug.mjs';

test('Hello World', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('  Café au Lait!! ', () => {
  assert.equal(slugify('  Café au Lait!! '), 'caf-au-lait');
});

test('--a--b--', () => {
  assert.equal(slugify('--a--b--'), 'a-b');
});

test('', () => {
  assert.equal(slugify(''), '');
});
