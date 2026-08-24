// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert'
import { test } from 'node:test'

import { html, raw } from '../../src/html/index.js'

test('a script payload cannot open a tag', () => {
  const out = html`<p>${'<script>alert(1)</script>'}</p>`.value

  assert.ok(!out.includes('<script'))
  assert.strictEqual(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
})

test('an ampersand is encoded once, alongside other entities', () => {
  const out = html`${'fish & <chips>'}`.value

  assert.strictEqual(out, 'fish &amp; &lt;chips&gt;')
  assert.strictEqual(out.split('amp;').length - 1, 1)
})

test('raw passes its value through unescaped', () => {
  assert.strictEqual(html`${raw('<b>x</b>')}`.value, '<b>x</b>')
})

test('a nested html result is not escaped again', () => {
  const inner = html`<b>${'x & y'}</b>`

  assert.strictEqual(html`<p>${inner}</p>`.value, '<p><b>x &amp; y</b></p>')
})

test('arrays join without a separator and escape each element', () => {
  assert.strictEqual(html`${['a', 'b']}`.value, 'ab')
  assert.strictEqual(html`[${[]}]`.value, '[]')
  assert.strictEqual(html`${['<a>', '&']}`.value, '&lt;a&gt;&amp;')
})

test('null, undefined and booleans render as nothing', () => {
  assert.strictEqual(html`[${null}]`.value, '[]')
  assert.strictEqual(html`[${undefined}]`.value, '[]')
  assert.strictEqual(html`[${false}]`.value, '[]')
  assert.strictEqual(html`[${true}]`.value, '[]')
})

test('an attribute value cannot break out of its quotes', () => {
  const double = html`<a href="${'" onmouseover="alert(1)'}">`.value
  const single = html`<a href='${"' onmouseover='alert(1)"}'>`.value

  assert.strictEqual(double, '<a href="&quot; onmouseover=&quot;alert(1)">')
  assert.strictEqual(double.split('"').length - 1, 2)
  assert.strictEqual(single, "<a href='&#39; onmouseover=&#39;alert(1)'>")
  assert.strictEqual(single.split("'").length - 1, 2)
})

test('a raw value and a hostile string in one template take different paths', () => {
  const out = html`${raw('<b>bold</b>')}${'<script>'}`.value

  assert.strictEqual(out, '<b>bold</b>&lt;script&gt;')
})
