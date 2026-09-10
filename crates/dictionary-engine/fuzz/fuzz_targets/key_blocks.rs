#![no_main]

use dictionary_engine::{MdictArchive, MdictKind, SliceSource};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = MdictArchive::read(&SliceSource(data), MdictKind::Resources);
});

