# Third-party notices

## Dictionary engine

The in-repository Rust/WebAssembly dictionary engine is the project author's original code, carried
under this repository's existing licence (0-BSD). It does not include source from `js-mdict`,
`mdict-rs`, `rs-mdict`, or other MDict parser implementations. The compiled engine uses the
following crates, pinned by `Cargo.lock`:

- `wasm-bindgen` and `js-sys` — MIT OR Apache-2.0
- `fst` and `utf8-ranges` — Unlicense OR MIT
- `miniz_oxide` — MIT OR Zlib OR Apache-2.0
- `lzokay` — MIT
- `encoding_rs` — Apache-2.0 OR MIT
- `quick-xml` — MIT
- `ripemd`, `sha2`, and their RustCrypto dependencies — MIT OR Apache-2.0
- `serde` and `serde_json` — MIT OR Apache-2.0
- `unicode-normalization` — MIT OR Apache-2.0

The generated `src/dictionary/engine/dictionary_engine_bg.wasm` and its JavaScript binding are
reproducible with `pnpm dictionary:engine`. No AGPL, GPL, or native Node extension is linked into
the plugin.
