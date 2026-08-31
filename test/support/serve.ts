// SPDX-License-Identifier: AGPL-3.0-or-later

// page.setContent applies no CSP, so a document that only ever loads that
// way proves nothing about style-src; this serves one over real http with
// the app's own header

import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";

import { contentSecurityPolicy } from "../../src/app.js";
import { styleHref, stylesheet } from "../../src/html/styles.js";

const root = resolve(import.meta.dirname, "../../..");

export type Served = {
  origin: string;
  close: () => Promise<void>;
};

export type ServedAsset = { type: string; body: string };

// documents and styles are read per request, so a caller may register a
// fixture after the server is up
export async function serve(options: {
  documents: Record<string, string>;
  styles?: Record<string, string>;
  assets?: Record<string, ServedAsset>;
  extraCss?: string;
}): Promise<Served> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] as string;
    response.setHeader("Content-Security-Policy", contentSecurityPolicy);

    if (path === styleHref) {
      response.setHeader("Content-Type", "text/css; charset=utf-8");
      response.end(`${stylesheet}${options.extraCss ?? ""}`);
      return;
    }

    const css = options.styles?.[path];
    if (css !== undefined) {
      response.setHeader("Content-Type", "text/css; charset=utf-8");
      response.end(css);
      return;
    }

    if (path.startsWith("/fonts/")) {
      const face = path.slice("/fonts/".length);
      response.setHeader("Content-Type", "font/woff2");
      response.end(readFileSync(join(root, "fonts", face)));
      return;
    }

    const asset = options.assets?.[path];
    if (asset !== undefined) {
      response.setHeader("Content-Type", asset.type);
      response.end(asset.body);
      return;
    }

    const document = options.documents[path];
    if (document === undefined) {
      response.statusCode = 404;
      response.end();
      return;
    }

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(document);
  });

  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", done);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the fixture server did not take a port");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((done, fail) => {
        server.close((error) => {
          if (error) fail(error);
          else done();
        });
      }),
  };
}
