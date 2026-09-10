#![no_main]

use dictionary_engine::{read_eudic, MdictArchive, MdictKind, SliceSource};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = MdictArchive::read(&SliceSource(data), MdictKind::Definitions);
    let _ = read_eudic(data);
});

