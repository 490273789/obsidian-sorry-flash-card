use fst::{
    automaton::{Levenshtein, Str},
    Automaton, IntoStreamer, Map, Streamer,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::{
    eudic::compile_eudic,
    package::{CompiledPackage, PackageCompiler, SourceDescriptor},
    EngineError, MdictArchive, MdictKind, ReadAt, Result,
};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = globalThis, js_name = dictionaryEngineRead)]
    fn dictionary_engine_read(file_id: u32, offset: f64, length: u32) -> js_sys::Uint8Array;
}

struct HostSource {
    file_id: u32,
    length: u64,
}

impl ReadAt for HostSource {
    fn len(&self) -> u64 {
        self.length
    }

    fn read_exact_at(&self, offset: u64, length: usize) -> Result<Vec<u8>> {
        let length = u32::try_from(length)
            .map_err(|_| EngineError::limit("dictionary read is too large"))?;
        let bytes = dictionary_engine_read(self.file_id, offset as f64, length);
        if bytes.length() != length {
            return Err(EngineError::corrupt("truncated dictionary read"));
        }
        Ok(bytes.to_vec())
    }
}

#[wasm_bindgen]
pub struct CompiledDictionary {
    package: CompiledPackage,
}

#[wasm_bindgen]
impl CompiledDictionary {
    #[wasm_bindgen(getter)]
    pub fn entry_count(&self) -> u64 {
        self.package.manifest.entry_count
    }

    #[wasm_bindgen(getter)]
    pub fn engine_version(&self) -> String {
        self.package.manifest.engine_version.clone()
    }

    pub fn file_count(&self) -> usize {
        self.package.files.len()
    }

    pub fn file_path(&self, index: usize) -> Option<String> {
        self.package.files.keys().nth(index).cloned()
    }

    pub fn take_file(&mut self, index: usize) -> Option<Vec<u8>> {
        let path = self.file_path(index)?;
        self.package.files.remove(&path)
    }
}

#[wasm_bindgen]
pub struct MdictCompileSession {
    compiler: Option<PackageCompiler>,
}

#[wasm_bindgen]
impl MdictCompileSession {
    #[wasm_bindgen(getter)]
    pub fn entry_count(&self) -> u64 {
        self.compiler
            .as_ref()
            .map_or(0, PackageCompiler::entry_count)
    }

    #[wasm_bindgen(getter)]
    pub fn engine_version(&self) -> String {
        crate::ENGINE_VERSION.to_owned()
    }

    pub fn file_count(&self) -> usize {
        self.compiler
            .as_ref()
            .map_or(0, PackageCompiler::file_count)
    }

    pub fn file_path(&self, index: usize) -> Option<String> {
        self.compiler.as_ref()?.file_path(index)
    }

    pub fn take_file(&mut self, index: usize) -> Option<Vec<u8>> {
        self.compiler.as_mut()?.take_file(index)
    }

    pub fn add_mdd(&mut self, file_id: u32, length: f64) -> std::result::Result<(), JsValue> {
        let archive = MdictArchive::read(&host_source(file_id, length)?, MdictKind::Resources)
            .map_err(engine_error)?;
        self.compiler
            .as_mut()
            .ok_or_else(|| engine_error(EngineError::corrupt("compile session is closed")))?
            .add_resources(&archive)
            .map_err(engine_error)
    }

    pub fn finish(&mut self) -> std::result::Result<CompiledDictionary, JsValue> {
        let compiler = self
            .compiler
            .take()
            .ok_or_else(|| engine_error(EngineError::corrupt("compile session is closed")))?;
        let package = compiler.finish().map_err(engine_error)?;
        Ok(CompiledDictionary { package })
    }
}

#[wasm_bindgen]
pub fn begin_mdict_compile(
    mdx_file_id: u32,
    mdx_length: f64,
    stylesheet: Option<String>,
    script: Option<String>,
    sources_json: &str,
) -> std::result::Result<MdictCompileSession, JsValue> {
    let definitions = MdictArchive::read(
        &host_source(mdx_file_id, mdx_length)?,
        MdictKind::Definitions,
    )
    .map_err(engine_error)?;
    let sources: Vec<SourceDescriptor> = serde_json::from_str(sources_json)
        .map_err(|_| engine_error(EngineError::corrupt("invalid source metadata")))?;
    let compiler = PackageCompiler::new(
        &definitions,
        stylesheet.as_deref(),
        script.as_deref(),
        None,
        sources,
    )
    .map_err(engine_error)?;
    Ok(MdictCompileSession {
        compiler: Some(compiler),
    })
}

#[wasm_bindgen]
pub fn compile_mdict_files(
    mdx_file_id: u32,
    mdx_length: f64,
    mdd_file_ids: &[u32],
    mdd_lengths: &[f64],
    stylesheet: Option<String>,
    script: Option<String>,
    sources_json: &str,
) -> std::result::Result<CompiledDictionary, JsValue> {
    if mdd_file_ids.len() != mdd_lengths.len() {
        return Err(engine_error(EngineError::corrupt(
            "resource file metadata mismatch",
        )));
    }
    let mut session =
        begin_mdict_compile(mdx_file_id, mdx_length, stylesheet, script, sources_json)?;
    for (&file_id, &length) in mdd_file_ids.iter().zip(mdd_lengths) {
        session.add_mdd(file_id, length)?;
    }
    session.finish()
}

#[wasm_bindgen]
pub fn compile_eudic_file(
    file_id: u32,
    file_length: f64,
    sources_json: &str,
) -> std::result::Result<CompiledDictionary, JsValue> {
    let sources: Vec<SourceDescriptor> = serde_json::from_str(sources_json)
        .map_err(|_| engine_error(EngineError::corrupt("invalid source metadata")))?;
    let source = host_source(file_id, file_length)?;
    let package = compile_eudic(&source, sources).map_err(engine_error)?;
    Ok(CompiledDictionary { package })
}

fn host_source(file_id: u32, length: f64) -> std::result::Result<HostSource, JsValue> {
    if !length.is_finite()
        || length < 0.0
        || length.fract() != 0.0
        || length > 9_007_199_254_740_991.0
    {
        return Err(engine_error(EngineError::corrupt(
            "invalid dictionary file length",
        )));
    }
    Ok(HostSource {
        file_id,
        length: length as u64,
    })
}

#[wasm_bindgen]
pub fn fst_exact(fst_bytes: &[u8], key: &str) -> std::result::Result<Option<u32>, JsValue> {
    let map = Map::new(fst_bytes).map_err(|_| corrupt_index())?;
    map.get(key)
        .map(|value| u32::try_from(value).map_err(|_| corrupt_index()))
        .transpose()
}

#[wasm_bindgen]
pub fn fst_prefix(
    fst_bytes: &[u8],
    prefix: &str,
    limit: usize,
) -> std::result::Result<String, JsValue> {
    let map = Map::new(fst_bytes).map_err(|_| corrupt_index())?;
    let automaton = Str::new(prefix).starts_with();
    let mut stream = map.search(automaton).into_stream();
    let mut values = Vec::new();
    while let Some((key, _)) = stream.next() {
        let key = std::str::from_utf8(key).map_err(|_| corrupt_index())?;
        values.push(key.to_owned());
        if values.len() >= limit.min(64) {
            break;
        }
    }
    serde_json::to_string(&values).map_err(|_| corrupt_index())
}

#[wasm_bindgen]
pub fn fst_fuzzy(
    fst_bytes: &[u8],
    query: &str,
    distance: u32,
    limit: usize,
) -> std::result::Result<String, JsValue> {
    if query.chars().count() > 48 || distance > 2 {
        return Err(engine_error(EngineError::limit("fuzzy query is too large")));
    }
    let map = Map::new(fst_bytes).map_err(|_| corrupt_index())?;
    let automaton = Levenshtein::new(query, distance)
        .map_err(|_| engine_error(EngineError::limit("fuzzy query automaton is too large")))?;
    let mut stream = map.search(automaton).into_stream();
    let mut values = Vec::new();
    while let Some((key, _)) = stream.next() {
        let key = std::str::from_utf8(key).map_err(|_| corrupt_index())?;
        values.push(key.to_owned());
        if values.len() >= limit.min(64) {
            break;
        }
    }
    serde_json::to_string(&values).map_err(|_| corrupt_index())
}

#[wasm_bindgen]
pub fn inflate_zlib(data: &[u8], expected_size: usize) -> std::result::Result<Vec<u8>, JsValue> {
    if expected_size > 32 * 1_048_576 {
        return Err(engine_error(EngineError::limit(
            "compiled frame is too large",
        )));
    }
    let output = miniz_oxide::inflate::decompress_to_vec_zlib_with_limit(data, expected_size)
        .map_err(|_| corrupt_index())?;
    if output.len() != expected_size {
        return Err(corrupt_index());
    }
    Ok(output)
}

fn corrupt_index() -> JsValue {
    engine_error(EngineError::corrupt("invalid compiled dictionary index"))
}

fn engine_error(error: EngineError) -> JsValue {
    #[derive(Serialize)]
    struct Payload<'a> {
        code: crate::ErrorCode,
        detail: &'a str,
    }
    let value = serde_json::to_string(&Payload {
        code: error.code,
        detail: error.detail,
    })
    .unwrap_or_else(|_| {
        "{\"code\":\"corrupt\",\"detail\":\"dictionary engine failure\"}".to_owned()
    });
    JsValue::from_str(&value)
}
