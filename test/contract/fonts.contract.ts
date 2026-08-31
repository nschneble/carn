// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { test } from "node:test";

import { type Face, readFace } from "../support/woff2.js";

type Shipped = {
  file: string;
  identifiers: Map<number, string>;
  upstream: string[];
  attribution: Map<number, string>;
  description: string;
  variable: boolean;
};

const sil = "SIL Open Font License";

const shipped: Shipped[] = [
  {
    file: "carn-sans.woff2",
    identifiers: new Map([
      [1, "Carn Sans SemiBold"],
      [3, "2.001;NSCH;CarnSans-SemiBold"],
      [4, "Carn Sans SemiBold"],
      [6, "CarnSans-SemiBold"],
    ]),
    upstream: ["Archivo"],
    attribution: new Map([
      [0, "Copyright 2020 The Archivo Project Authors"],
      [7, "Archivo is a trademark of Omnibus-Type."],
      [8, "Omnibus-Type"],
      [9, "Hector Gatti"],
      [11, "http://www.omnibus-type.com"],
      [13, sil],
    ]),
    description:
      "Carn Sans is an axis-clamped, subset build of Archivo 2.001 and is not the original font.",
    variable: true,
  },
  {
    file: "carn-mono-400.woff2",
    identifiers: new Map([
      [1, "Carn Mono"],
      [3, "2.3;NSCH;CarnMono-Regular"],
      [4, "Carn Mono"],
      [6, "CarnMono-Regular"],
    ]),
    upstream: ["Plex"],
    attribution: new Map([
      [0, "Copyright 2017 IBM Corp."],
      [7, "IBM Plex(r) is a trademark of IBM Corp"],
      [8, "Bold Monday"],
      [9, "Mike Abbink, Paul van der Laan, Pieter van Rosmalen"],
      [11, "http://www.boldmonday.com"],
      [13, sil],
    ]),
    description:
      "Carn Mono is a subset build of IBM Plex Mono 2.3 and is not the original font.",
    variable: false,
  },
  {
    file: "carn-mono-500.woff2",
    identifiers: new Map([
      [1, "Carn Mono Medium"],
      [3, "2.3;NSCH;CarnMono-Medium"],
      [4, "Carn Mono Medium"],
      [6, "CarnMono-Medium"],
    ]),
    upstream: ["Plex"],
    attribution: new Map([
      [0, "Copyright 2017 IBM Corp."],
      [7, "IBM Plex(r) is a trademark of IBM Corp"],
      [8, "Bold Monday"],
      [9, "Mike Abbink, Paul van der Laan, Pieter van Rosmalen"],
      [11, "http://www.boldmonday.com"],
      [13, sil],
    ]),
    description:
      "Carn Mono is a subset build of IBM Plex Mono 2.3 and is not the original font.",
    variable: false,
  },
];

const faces = new Map<string, Face>(
  shipped.map((face) => [face.file, readFace(face.file)]),
);

function face(file: string): Face {
  const parsed = faces.get(file);
  assert.ok(parsed, `${file} was not parsed`);
  return parsed;
}

function textOf(parsed: Face, id: number): string {
  const record = parsed.names.find((name) => name.id === id);
  assert.ok(record, `name ID ${id} is missing`);
  return record.text;
}

test("every name record naming the face names the Carn build", () => {
  for (const entry of shipped) {
    const parsed = face(entry.file);

    for (const [id, expected] of entry.identifiers) {
      assert.strictEqual(
        textOf(parsed, id),
        expected,
        `${entry.file} ID ${id}`,
      );
    }

    const named = parsed.names.filter(
      (name) => name.id >= 256 || entry.identifiers.has(name.id),
    );

    for (const name of named) {
      for (const upstream of entry.upstream) {
        assert.ok(
          !name.text.includes(upstream),
          `${entry.file} ID ${name.id} still reads ${name.text}`,
        );
      }
    }
  }
});

test("the upstream attribution records survive the subset", () => {
  for (const entry of shipped) {
    const parsed = face(entry.file);

    for (const [id, expected] of entry.attribution) {
      assert.ok(
        textOf(parsed, id).includes(expected),
        `${entry.file} ID ${id} lost ${expected}`,
      );
    }
  }
});

test("each face names its source family and version in the description", () => {
  for (const entry of shipped) {
    const description = textOf(face(entry.file), 10);
    assert.strictEqual(description, entry.description);

    for (const restated of ["Copyright", sil]) {
      assert.ok(
        !description.includes(restated),
        `${entry.file} ID 10 restates ${restated}`,
      );
    }
  }
});

test("the display face keeps its six clamped instances, the mono faces none", () => {
  for (const entry of shipped) {
    const parsed = face(entry.file);
    if (!entry.variable) {
      assert.strictEqual(parsed.axes.size, 0, `${entry.file} gained an axis`);
      assert.strictEqual(parsed.instances.length, 0);
      continue;
    }

    assert.deepStrictEqual(
      [...parsed.axes],
      [
        ["wght", [400, 600, 900]],
        ["wdth", [100, 100, 125]],
      ],
    );

    assert.deepStrictEqual(
      parsed.instances.map((instance) => [...instance.coordinates]),
      [400, 500, 600, 700, 800, 900].map((weight) => [
        ["wght", weight],
        ["wdth", 100],
      ]),
    );

    assert.deepStrictEqual(
      parsed.instances.map((instance) => textOf(parsed, instance.postscript)),
      [
        "CarnSansRoman-Regular",
        "CarnSansRoman-Medium",
        "CarnSansRoman-SemiBold",
        "CarnSansRoman-Bold",
        "CarnSansRoman-ExtraBold",
        "CarnSansRoman-Black",
      ],
    );
  }
});
