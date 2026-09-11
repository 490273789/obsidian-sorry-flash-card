// Both protocols share one generated inline worker so the WASM engine is embedded only once.
// oxlint-disable-next-line import/no-unassigned-import -- importing installs the compiler protocol.
import "./compiler.worker";
// oxlint-disable-next-line import/no-unassigned-import -- importing installs the query protocol.
import "./query.worker";
