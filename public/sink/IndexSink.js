// ---------------------------------------------------------------------------
// 0KEY — IndexSink
// path: public/sink/IndexSink.js
//
// The control room has no state. It only needs the codex dressed onto the
// document, which is exactly what boot() does.
// ---------------------------------------------------------------------------

import { boot } from './CSSVarSink.js';

await boot('index');
