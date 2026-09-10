#![forbid(unsafe_code)]

mod error;
mod eudic;
mod mdict;
mod package;
mod source;
#[cfg(target_arch = "wasm32")]
mod wasm;

pub use error::{EngineError, ErrorCode, Result};
pub use eudic::read_eudic;
pub use mdict::{DictionaryEntry, MdictArchive, MdictKind};
pub use package::{compile_archive, CompiledPackage, COMPILED_FORMAT_VERSION, ENGINE_VERSION};
pub use source::{ReadAt, SliceSource};
