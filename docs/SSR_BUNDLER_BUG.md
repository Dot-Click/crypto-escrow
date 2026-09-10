# SSR bundler bug: first-time Radix import crashes the server entry

**Symptom:** every route returns HTTP 500 in production (Vercel), with the
app's generic error page. Locally, `npm run build` succeeds — the bug only
shows up when the built server bundle actually runs.

**Cause:** this project's current toolchain (Vite 8 beta + Rolldown, Nitro 3
beta) has a circular-chunk bug in its SSR output. The first time a package is
imported into the server bundle, the generated chunk graph can end up with a
circular import between the framework's router chunk and the new dependency's
chunk. At runtime this throws:

```
TypeError: __exportAll is not a function
```

We hit this specifically via `@radix-ui/react-accordion` (pulled in by the
shadcn `Accordion` component), used only on `/faq`. Removing that import
(swapping to plain `<details>/<summary>`) fixed it immediately, with no other
code changes.

**How it was diagnosed:** build success does not prove the bundle works.
Verify the actual compiled output directly:

```js
// repro.mjs (scratchpad, not committed)
process.env.NODE_ENV = "production";
const mod = await import("./.vercel/output/functions/__server.func/index.mjs");
const handler = mod.default ?? mod;
const res = await (mod.default ?? mod).fetch(new Request("http://localhost/"), {}, {});
console.log("STATUS", res.status);
```

Bisecting commits (`git checkout <sha>`, rebuild, run the script above) and
then removing files one at a time within the guilty commit narrowed it down
to the single import.

**How to avoid it going forward:** before adding any *new* third-party UI
package (Radix primitives in particular) to a route, rebuild and run the
script above against a fresh `.vercel/output` to confirm the server entry
still responds before committing. Prefer native HTML elements
(`<details>`, `<dialog>`, etc.) over pulling in a new headless-UI package
when the native element covers the need, until this toolchain moves off its
current beta versions.
