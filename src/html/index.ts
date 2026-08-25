// SPDX-License-Identifier: AGPL-3.0-or-later

export class Raw {
  constructor(readonly value: string) {}
}

export function raw(value: string): Raw {
  return new Raw(value)
}

const entities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
} as const

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => entities[char as keyof typeof entities])
}

function render(value: unknown): string {
  if (value instanceof Raw) return value.value
  if (typeof value === 'string') return escape(value)
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (value === null || value === undefined || typeof value === 'boolean') return ''
  if (Array.isArray(value)) return value.map((element) => render(element)).join('')
  return escape(String(value))
}

function cooked(strings: TemplateStringsArray, index: number): string {
  const chunk: string | undefined = strings[index]
  if (chunk === undefined) {
    throw new Error(
      `html: chunk ${index} has an invalid escape sequence; fix it or double the backslash`,
    )
  }
  return chunk
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = cooked(strings, 0)
  for (const [index, value] of values.entries()) {
    out += render(value) + cooked(strings, index + 1)
  }
  return new Raw(out)
}
