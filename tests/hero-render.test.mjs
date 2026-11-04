import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Regression test: Hero once referenced an undefined `i` and crashed on render, which
// unmounted the whole React tree and left phones on a blank page.
test("Hero renders without throwing, with and without a featured product", async () => {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hero-")), "hero.cjs");
  await build({
    stdin: {
      contents: `import React from 'react';
        import { renderToString } from 'react-dom/server';
        import Hero from './frontend/src/features/catalog/components/Hero.jsx';
        export const render = (props) => renderToString(React.createElement(Hero, props));`,
      resolveDir: process.cwd(),
      loader: "jsx",
    },
    bundle: true, platform: "node", format: "cjs", outfile, jsx: "automatic",
    loader: { ".js": "jsx" }, logLevel: "silent",
  });
  const { render } = createRequire(import.meta.url)(outfile);

  const empty = render({ featured: null, loading: false });
  assert.match(empty, /Strawp/);
  assert.match(empty, /<img/);

  // While loading with nothing cached, no placeholder photo is downloaded.
  assert.doesNotMatch(render({ featured: null, loading: true }), /<img/);

  const featured = { name: "Helmet", type: "Helmets", price: 10, image: "https://images.example/h.jpg" };
  assert.match(render({ featured, loading: false }), /Helmet/);
});
