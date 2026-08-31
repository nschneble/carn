// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { brotliDecompressSync } from "node:zlib";

const knownTags = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

const windows = 3;

export type NameRecord = { id: number; text: string };

export type Instance = {
  subfamily: number;
  postscript: number;
  coordinates: Map<string, number>;
};

export type Face = {
  names: NameRecord[];
  axes: Map<string, [number, number, number]>;
  instances: Instance[];
};

function base128(bytes: Buffer, start: number): [number, number] {
  let value = 0;
  let at = start;
  for (let step = 0; step < 5; step += 1) {
    const byte = bytes.readUInt8(at);
    at += 1;
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return [value, at];
    }
  }
  throw new Error("UIntBase128 ran past five bytes");
}

function tables(face: Buffer): Map<string, Buffer> {
  assert.strictEqual(face.toString("latin1", 0, 4), "wOF2");

  const count = face.readUInt16BE(12);
  const compressedLength = face.readUInt32BE(20);
  const directory: [string, number][] = [];
  let at = 48;

  for (let entry = 0; entry < count; entry += 1) {
    const flags = face.readUInt8(at);
    at += 1;

    const index = flags & 0x3f;
    let tag: string;
    if (index === 0x3f) {
      tag = face.toString("latin1", at, at + 4);
      at += 4;
    } else {
      tag = knownTags[index] as string;
    }

    let length: number;
    [length, at] = base128(face, at);

    const version = flags >> 6;
    const transformed =
      tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    if (transformed) {
      [length, at] = base128(face, at);
    }

    directory.push([tag, length]);
  }

  const stream = brotliDecompressSync(face.subarray(at, at + compressedLength));
  const found = new Map<string, Buffer>();
  let offset = 0;

  for (const [tag, length] of directory) {
    found.set(tag, stream.subarray(offset, offset + length));
    offset += length;
  }

  return found;
}

function readNames(table: Buffer): NameRecord[] {
  const count = table.readUInt16BE(2);
  const strings = table.readUInt16BE(4);
  const records: NameRecord[] = [];

  for (let entry = 0; entry < count; entry += 1) {
    const at = 6 + entry * 12;
    if (table.readUInt16BE(at) !== windows) {
      continue;
    }
    const length = table.readUInt16BE(at + 8);
    const offset = strings + table.readUInt16BE(at + 10);
    const utf16 = Buffer.from(table.subarray(offset, offset + length));
    records.push({
      id: table.readUInt16BE(at + 6),
      text: utf16.swap16().toString("utf16le"),
    });
  }

  return records;
}

function fixed(table: Buffer, at: number): number {
  return table.readInt32BE(at) / 65536;
}

function readFvar(table: Buffer | undefined): Pick<Face, "axes" | "instances"> {
  const axes = new Map<string, [number, number, number]>();
  const instances: Instance[] = [];
  if (!table) {
    return { axes, instances };
  }

  const start = table.readUInt16BE(4);
  const axisCount = table.readUInt16BE(8);
  const axisSize = table.readUInt16BE(10);
  const instanceCount = table.readUInt16BE(12);
  const instanceSize = table.readUInt16BE(14);
  const tags: string[] = [];

  for (let axis = 0; axis < axisCount; axis += 1) {
    const at = start + axis * axisSize;
    const tag = table.toString("latin1", at, at + 4);
    tags.push(tag);
    axes.set(tag, [
      fixed(table, at + 4),
      fixed(table, at + 8),
      fixed(table, at + 12),
    ]);
  }

  const first = start + axisCount * axisSize;
  const named = instanceSize === axisCount * 4 + 6;
  for (let entry = 0; entry < instanceCount; entry += 1) {
    const at = first + entry * instanceSize;
    const coordinates = new Map<string, number>();
    tags.forEach((tag, axis) => {
      coordinates.set(tag, fixed(table, at + 4 + axis * 4));
    });
    instances.push({
      subfamily: table.readUInt16BE(at),
      postscript: named ? table.readUInt16BE(at + 4 + axisCount * 4) : 0xffff,
      coordinates,
    });
  }

  return { axes, instances };
}

export function readFace(file: string): Face {
  const root = resolve(import.meta.dirname, "../../..");
  const found = tables(readFileSync(join(root, "fonts", file)));
  const name = found.get("name");
  assert.ok(name, `${file} has no name table`);

  return { names: readNames(name), ...readFvar(found.get("fvar")) };
}
