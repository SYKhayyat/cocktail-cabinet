# Local AI runtime: provenance and executable boundary (#74)

The provider order remains **Chrome built-in AI → Ollama → WebGPU → WASM**.
No tier holds an API key. WebRTC/BroadcastChannel remain independent of model
availability. This change does not install a server, remove a provider, or claim
that local Llama is Claude.

## What is vendored

`vendor/ai/transformers-3.0.2.min.js` is the **unmodified browser ESM bundle**
from `@huggingface/transformers@3.0.2`, not jsDelivr's `+esm` transformation.
It bundles the browser ONNX runtime, Jinja, and tokenizer implementation; it has
no external ESM imports. The matching ONNX JSEP factory and WASM come from
`onnxruntime-web@1.21.0-dev.20241024-d9ca84ef96` (upstream source commit
`d9ca84ef96bae72da9ebcac5c591faca8dd52e78`). These versions preserve the
previous Transformers API, q4f16 WebGPU and q4 WASM behavior instead of making an
untested major-version migration.

The exact npm dependency-resolution provenance is in
`scripts/ai-runtime/package-lock.json`. Both top-level versions are exact, and
every npm archive has its registry URL and SHA-512 integrity. The release uses
the published browser bundle byte-for-byte: it does **not** rebuild it against
whatever transitive dependencies resolve today. Node-only dependencies in that
lock (notably `sharp` and `onnxruntime-node`) are never installed or served as
runtime code. Do not run `npm install` in that directory for deployment.

`vendor/ai/manifest.json` records archive member, byte count and SHA-256 for
each shipped executable and license. The executable assets total **22,439,347
bytes** (21.40 MiB); with licenses, **22,451,778 bytes**. The largest individual
file is 21,643,825 bytes, below Cloudflare Pages' 25 MiB per-file limit.

| Asset | SHA-256 |
| --- | --- |
| Transformers browser bundle (748,496 bytes) | `495b03b846b315baab6ff2e2f048085e45684b910799e36c4d7f2b4be00cff72` |
| ORT factory (47,026 bytes) | `4af7e6357fb43c77cda750544afd8677f12ed5009fc5168d1a0ae4afb44a37b6` |
| ORT WASM (21,643,825 bytes) | `0f6fe5c40378504d1a25a77f766133464bb15705af23e01c994f185719fb080e` |

Verify a checkout without network access:

```sh
npm run check:ai-runtime
```

Reconstruct the exact assets from the locked registry tarballs (Node 22 + tar;
no npm lifecycle scripts or build dependencies execute):

```sh
node scripts/vendor-ai-runtime.mjs --restore
```

The reconstruction verifies tarball SHA-512 first, then every extracted SHA-256
before replacing any asset. An optional archive directory uses already acquired
archives with their registry basenames (`transformers-3.0.2.tgz` and
`onnxruntime-web-1.21.0-dev.20241024-d9ca84ef96.tgz`); license restoration still
fetches the pinned upstream license. It never regenerates the expected hashes.
Both `npm test` and the deployment's `npm run check` verify the checked-in bytes.

## Review scope and remaining trust

The dependency-boundary review checked the published browser bundle's imports,
backend defaults, conditional Node dependencies, WASM asset selection, dynamic
worker creation, and the application's overriding configuration. It is **not**
a claim to have audited every upstream inference kernel or tokenizer algorithm.
The upstream bundle contains a CDN default, but `configureRuntime` replaces it
before loading any model; the app verifies the local WASM SHA-256 before handing
its bytes to ONNX. An integrity mismatch fails closed with a user-visible error,
never retrying a CDN. Same-origin JS integrity is enforced at release/CI time,
not by browser SRI (ESM imports do not accept an integrity attribute).

`npm audit --package-lock-only --omit=dev` on 2026-10-06 reports two high entries:
Transformers via `sharp`, and `sharp`'s libvips/libheif advisories
`GHSA-f88m-g3jw-g9cj` and `GHSA-rgj7-g3m4-5g8c`. The shipped browser bundle's
`sharp` module is explicitly ignored and there is no native image library in the
vendored files. These Node-only advisories do not justify claiming a clean npm
audit, but do not execute in this text-only browser deployment. Future runtime
updates must repeat the boundary review, hashes, actual executable tests and
provider compatibility checks rather than automatically accepting new bytes.

## Model data and offline behavior

`src/ai/runtime-config.js` pins model-data commits:

| Backend | Model | Commit |
| --- | --- | --- |
| WebGPU (`q4f16`) | `onnx-community/Llama-3.2-1B-Instruct-q4f16` | `056c2877d2a38b1bbe39f10f145ad8cde5f1e24b` |
| WASM (`q4`) | `onnx-community/Llama-3.2-1B-Instruct-ONNX` | `14007543b6dc92de88daf96a9aa85d2f95ace6ef` |

Weights, ONNX graph/external tensor data, tokenizer and JSON configuration still
download from Hugging Face over HTTPS when missing. They are model **data**, not
remote JavaScript. The WebGPU graph is about 1.24 GB; the WASM external tensor
file alone is about 1.69 GB. Download time, memory and quota remain substantial.
The commits prevent floating `main` changes; model-data bytes are not separately
SHA-256 verified by this patch. Their trust boundary remains Hugging Face's HTTPS
immutable-revision delivery, the model publisher, and the ONNX/tokenizer parser.

Transformers uses the browser Cache API with revision-specific URLs. A v6 ready
marker without the pinned revision is no longer accepted for browser models.
Markers only record a successful past load; they are **not** proof that cache
entries survived eviction. If the same revision's entire model cache and runtime
HTTP cache survive, a later load can work offline; otherwise it reports failure.
There is no service worker/offline app-shell guarantee, and the runtime WASM must
still be available from the site or its HTTP cache. Persistent storage is
requested, but the browser may refuse it.

Chrome manages its own built-in model/version/downloads outside this page's
fetch/CSP. Ollama uses the locally installed `llama3.2:1b` tag, not a browser-pinned
weight digest: local administrators control that runtime and model. An already
installed Ollama model can operate without internet. The app never automatically
pulls an Ollama model. These providers are deliberately not disguised as pinned
Hugging Face downloads.

## CSP coordination (#79)

For the AI executable boundary:

- `script-src 'self' 'wasm-unsafe-eval'`: local JS plus WASM compilation, **not**
  unrestricted `unsafe-eval`, jsDelivr, or arbitrary third-party script hosts.
- `worker-src 'self'`: app-owned module worker. `numThreads=1` and `proxy=false`
  deliberately avoid ONNX blob/proxy/pthread workers and cross-origin isolation.
- `connect-src 'self' https://huggingface.co https://*.hf.co
  http://127.0.0.1:11434 http://127.0.0.1:11435
  http://localhost:11434 http://localhost:11435`: local WASM, model data and the
  existing Ollama loopback choices. Both pinned weight HEAD requests redirected
  to `https://us.aws.cdn.hf.co` during review; HF may route downloads through
  `cas-bridge.xethub.hf.co` or other `*.hf.co` regional delivery hosts. These are
  connect/data permissions, never script permissions. Old `cdn-lfs.huggingface.co`
  hosts were not used by these pinned revisions; add one only with observed
  deployment evidence, not a blanket script exception.

Do not add `upgrade-insecure-requests`: it rewrites Ollama's intentionally HTTP
loopback endpoints. WebRTC's STUN exchange is not fetch/XHR and remains a separate
real-peer deployment check. Headers/HSTS are owned by #79 and must be verified on
the live deployment.

### Ollama is unreachable from the deployed origin — this is not configurable

**The local Ollama provider works when the cabinet is served from a loopback
origin, and cannot work when it is served from `https://games.siachshai.online`.**
That is a browser-enforced boundary, not a misconfiguration, and no setting on
this machine, in Ollama, or in the site changes it.

Two independent gates stop the request:

1. **CORS.** Ollama answers only loopback origins by default, so a page on the
   deployed origin gets `403 Forbidden` from `OLLAMA_HOST=127.0.0.1:11434`.
2. **Private Network Access.** The deployed origin is *public* and the loopback
   address is *private*, which is a second, stricter gate. Even with the origin
   correctly allowed:

   ```sh
   OLLAMA_ORIGINS="https://games.siachshai.online" ollama serve
   ```

   CORS then succeeds — Ollama logs `204` with a correct
   `Access-Control-Allow-Origin` — but the browser **still** discards the
   response. PNA additionally requires
   `Access-Control-Allow-Private-Network: true`, which Ollama does not emit on
   any response or preflight. Disabling the browser's PNA preflight behaviour
   does not change the outcome either.

No web page can grant itself this. A site that could widen its own reach into
localhost would let any page you visited read your local model server, so the
browser deliberately refuses. `OLLAMA_ORIGINS` alone is therefore **not** a fix,
and a NixOS service edit that adds it will change nothing.

**Consequently the deployed site cannot offer the Ollama provider to visitors.**
A visitor from the deployed origin sees "Ollama unavailable" no matter how the
local machine is configured. Local development and local play over loopback are
unaffected and fully supported; this is the only shape that works today.

To confirm which case you are in — same browser, same Ollama, origin is the only
variable:

```sh
# Loopback origin: 200. Deployed origin: refused.
curl -s -o /dev/null -w 'local     %{http_code}\n' \
  -H 'Origin: http://127.0.0.1:8765' http://127.0.0.1:11434/api/tags
curl -s -o /dev/null -w 'deployed  %{http_code}\n' \
  -H 'Origin: https://games.siachshai.online' http://127.0.0.1:11434/api/tags
```

The automated browser suite serves from a loopback origin, so **it passes either
way and cannot detect this**. Any future provider support for a public origin
needs a genuinely different transport (an HTTPS endpoint with a certificate the
browser accepts, or a relay); adding an origin to Ollama's allowlist is not one.

## Evidence and honest limits

```sh
npm test
npm run check
CDP_URL=http://127.0.0.1:9321 npm run test:ai-runtime:browser
```

The runtime tests execute the actual browser bundle in a browser-like module
realm, refuse external executable imports, validate every release hash, reject
tampering, instantiate the actual vendored WASM and execute ONNX initialization.
The dedicated Chromium check additionally imports both real browser runtime
modules in an actual module worker under the restrictive self-only CSP, executes
WASM initialization, exercises the real app worker's unsupported-model error,
and proves that worker termination closes an in-flight local WASM download with
no late messages. It requires an isolated Chromium CDP endpoint and refuses the
OmniRush/Electron desktop endpoint. Existing #82 tests cover Chrome/Ollama signals,
shared-load ownership, worker cancellation/reload and no post-destroy mutation;
their provider doubles are contract tests, not claims of actual model inference.

These checks do **not** establish a successful 1B-model completion on real
WebGPU hardware, full WASM-model inference, Chrome's managed model availability,
real Ollama CORS/setup, or offline cache retention. Those remain explicit manual
provider/device and post-deployment gates in `PLAN.md`.
