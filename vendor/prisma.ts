// SPDX-License-Identifier: MIT
//
// Vendored from https://github.com/witch-factory/highlightjs-prisma
// (src/languages/prisma.js), by SungHyun Kim <soakdma37@gmail.com>.
//
// Copyright (c) 2024 SungHyun Kim
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// Modified from the original: ported to TypeScript, comments translated
// from Korean, case_insensitive corrected to false (the schema language
// distinguishes Int from int), and FIELD_DEFINITION's optional and
// required markers scoped as operators rather than types.

import type { HLJSApi, Language, Mode } from "highlight.js";

export default function prisma(hljs: HLJSApi): Language {
  const TYPES = [
    "Int",
    "BigInt",
    "String",
    "DateTime",
    "Bytes",
    "Decimal",
    "Float",
    "Json",
    "Boolean",
  ];

  const KEYWORDS = ["model", "enum", "type", "datasource", "generator", "view"];

  const COMMENTS: Mode = {
    scope: "comment",
    variants: [
      hljs.COMMENT("///", "$"),
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      { match: /\/\/[^\n]*/ },
    ],
  };

  const LITERAL_VALUE: Mode = {
    scope: "literal",
    begin: /\$(null|true|false)\b/,
  };

  const NUMBER: Mode = {
    scope: "number",
    match:
      /((0(x|X)[0-9a-fA-F]*)|(\+|-)?\b(([0-9]+(?:\.[0-9]*)?)|(\.[0-9]+))((e|E)(\+|-)?[0-9]+)?)(?:[LlFfUuDdg]|UL|ul)?\b/,
  };

  const IDENTIFIER: Mode = {
    scope: "variable",
    match: /\b(\w+)\b/,
  };

  const DOUBLE_QUOTED_STRING: Mode = {
    scope: "string",
    begin: '"',
    end: '"',
    contains: [
      {
        scope: "subst",
        begin: /\$\{/,
        beginScope: "punctuation",
        end: /\s*\}/,
        endScope: "punctuation",
        keywords: {
          $pattern: /[\w.]+/,
          keyword: KEYWORDS,
          type: TYPES,
        },
        contains: [LITERAL_VALUE, NUMBER, IDENTIFIER],
      },
    ],
  };

  const LITERAL = [LITERAL_VALUE, NUMBER, DOUBLE_QUOTED_STRING];

  const ARRAY: Mode = {
    begin: /\[/,
    beginScope: "punctuation",
    end: /\]/,
    endScope: "punctuation",
    contains: ["self", ...LITERAL],
  };

  const FUNCTIONAL: Mode = {
    begin: [/(\w+)/, /\s*/, /\(/],
    beginScope: { 1: "title.function", 3: "punctuation" },
    end: /\)/,
    endScope: "punctuation",
    contains: ["self", ...LITERAL],
  };

  const MAP_KEY: Mode = {
    scope: "symbol",
    match: /(\w+)\s*(:)\s*/,
  };

  const VALUE = [
    LITERAL_VALUE,
    NUMBER,
    DOUBLE_QUOTED_STRING,
    ARRAY,
    FUNCTIONAL,
  ];

  const ATTRIBUTE: Mode = {
    scope: "attr",
    match: /(@@?[\w.]+)/,
  };

  const ATTRIBUTE_WITH_ARGUMENT: Mode = {
    begin: [/@@?[\w.]+/, /\s*/, /\(/],
    beginScope: { 1: "attribute", 3: "punctuation" },
    end: /\)/,
    endScope: "punctuation",
    contains: [MAP_KEY, ...VALUE],
  };

  const ASSIGNMENT: Mode = {
    begin: [/[^@]\w+/, /\s*/, /=/, /\s*/],
    beginScope: { 1: "variable", 3: "operator" },
    end: /\n/,
    contains: [...VALUE, hljs.C_LINE_COMMENT_MODE],
  };

  const ENUM_VALUE_DEFINITION: Mode = {
    scope: "variable",
    match: /^\s*(\w+)\s*/,
    contains: [ATTRIBUTE_WITH_ARGUMENT, ATTRIBUTE],
  };

  const ENUM_BLOCK_DEFINITION: Mode = {
    begin: [/(enum)/, /\s+/, /([A-Za-z][\w]*)/, /\s+/, /({)/],
    beginScope: { 1: "keyword", 3: "title.class", 5: "punctuation" },
    end: /\s*}/,
    endScope: "punctuation",
    contains: [COMMENTS, ENUM_VALUE_DEFINITION],
  };

  const CONFIG_BLOCK_DEFINITION: Mode = {
    begin: [/(datasource|generator)/, /\s+/, /([A-Za-z][\w]*)/, /\s+/, /({)/],
    beginScope: { 1: "keyword", 3: "title.class", 5: "punctuation" },
    end: /\s*}/,
    endScope: "punctuation",
    contains: [COMMENTS, ASSIGNMENT],
  };

  const TYPE_DEFINITION: Mode = {
    begin: [/(type)/, /\s+/, /\w+/, /\s*=\s*/, /(\w+)/],
    beginScope: { 1: "keyword", 3: "type", 5: "title.class" },
    end: /\n/,
    contains: [ATTRIBUTE_WITH_ARGUMENT, ATTRIBUTE],
  };

  const FIELD_DEFINITION: Mode = {
    begin: [
      /(\w+)/,
      /(\s*:)?/,
      /\s+/,
      /((?!(?:Int|BigInt|String|DateTime|Bytes|Decimal|Float|Json|Boolean)\b)\b\w+)?/,
      /(Int|BigInt|String|DateTime|Bytes|Decimal|Float|Json|Boolean)?/,
      /(\[\])?/,
      /(\?)?/,
      /(!)?/,
    ],
    beginScope: {
      1: "title",
      4: "type",
      5: "type",
      6: "operator",
      7: "operator",
      8: "operator",
    },
    end: /\n/,
    contains: [ATTRIBUTE_WITH_ARGUMENT, ATTRIBUTE, COMMENTS],
  };

  const MODEL_BLOCK_DEFINITION: Mode = {
    begin: [/(model|type|view)/, /\s+/, /([A-Za-z][\w]*)/, /\s*/, /({)/],
    beginScope: { 1: "keyword", 3: "title.class", 5: "punctuation" },
    end: /\s*}/,
    endScope: "punctuation",
    contains: [COMMENTS, FIELD_DEFINITION, ATTRIBUTE_WITH_ARGUMENT, ATTRIBUTE],
  };

  return {
    name: "Prisma schema language",
    case_insensitive: false,
    keywords: {
      keyword: KEYWORDS,
      type: TYPES,
      literal: ["true", "false", "null"],
    },
    contains: [
      COMMENTS,
      MODEL_BLOCK_DEFINITION,
      CONFIG_BLOCK_DEFINITION,
      ENUM_BLOCK_DEFINITION,
      TYPE_DEFINITION,
    ],
  };
}
