#![cfg_attr(not(any(test, target_arch = "wasm32")), allow(dead_code))]

use std::collections::{BTreeMap, VecDeque};

use miniz_oxide::{
    inflate::stream::{inflate, InflateState},
    DataFormat, MZFlush, MZStatus,
};

use crate::{
    package::{compile_archive, CompiledPackage, PackageCompiler, SourceDescriptor},
    DictionaryEntry, EngineError, MdictArchive, MdictKind, ReadAt, Result,
};

const EUDIC_MAGIC: [u8; 2] = [0x56, 0x11];
const IMAGE_MAX_SOURCE_BYTES: u64 = 32 * 1_048_576;
const GENERAL_MAX_SOURCE_BYTES: u64 = 512 * 1_048_576;
const GENERAL_FIXED_HEADER_BYTES: u64 = 20 + 1018;
const GENERAL_BLOCK_BYTES: usize = 16 * 1_024;
const MAX_PACKED_BLOCK_BYTES: usize = 1_048_576;
const MAX_BLOCK_BYTES: usize = 1_048_576;
const MAX_GENERAL_DECOMPRESSED_BYTES: u64 = 2 * 1024 * 1_048_576;
const MAX_KEY_POOL_BYTES: usize = 64 * 1_048_576;
const MAX_ENTRIES: usize = 1_000_000;
const MAX_RECORD_BYTES: usize = 8 * 1_048_576;
const MAX_RESOURCES: usize = 4096;
const MAX_RESOURCE_BYTES: usize = 21_000_000;
const MAX_RESOURCE_NAMES_BYTES: usize = 1_048_576;
const MAX_STYLESHEET_BYTES: usize = 8 * 1_048_576;
const MAX_SCRIPT_BYTES: usize = 8 * 1_048_576;
const SOURCE_READ_BYTES: usize = 64 * 1024;
const BLOCK_CACHE_SIZE: usize = 8;
const RESOURCE_DESCRIPTOR_BYTES: usize = 24;
const RESOURCE_PREFIX: &str = "eudic-word-card-en-v2/";
const REMOTE_PREFIX: &str = "https://fs-gateway.frdic.com/buckets/main/store_main/word_card/v2/en/";

pub(crate) fn compile_eudic<S: ReadAt>(
    source: &S,
    sources: Vec<SourceDescriptor>,
) -> Result<CompiledPackage> {
    let magic = source.read_exact_at(0, 2)?;
    if magic != EUDIC_MAGIC {
        return Err(EngineError::unsupported("unsupported EUDIC dictionary"));
    }
    if source.len() <= IMAGE_MAX_SOURCE_BYTES {
        if let Ok(length) = usize::try_from(source.len()) {
            if let Ok(bytes) = source.read_exact_at(0, length) {
                if let Ok(definitions) = read_eudic(&bytes) {
                    return compile_archive(
                        &definitions,
                        &[],
                        None,
                        None,
                        Some("eudic-word-card-en-v2"),
                        sources,
                    );
                }
            }
        }
    }
    compile_general_eudic(source, sources)
}

pub fn read_eudic(source: &[u8]) -> Result<MdictArchive> {
    if source.len() < 28
        || source.len() as u64 > IMAGE_MAX_SOURCE_BYTES
        || !source.starts_with(&EUDIC_MAGIC)
    {
        return Err(EngineError::unsupported("invalid EUDIC image dictionary"));
    }
    let block_offset = usize::from(read_u16(source, 6)?);
    if block_offset < 20 || block_offset >= source.len() {
        return Err(EngineError::corrupt("invalid EUDIC block offset"));
    }
    let mut records_data = Vec::new();
    let mut offset = block_offset;
    let mut block_count = 0_usize;
    while is_zlib_header(source, offset) {
        let (consumed, block) = inflate_one(&source[offset..], MAX_BLOCK_BYTES)?;
        records_data
            .len()
            .checked_add(block.len())
            .filter(|length| *length <= 64 * 1_048_576)
            .ok_or_else(|| EngineError::limit("EUDIC decompressed data is too large"))?;
        records_data.extend_from_slice(&block);
        offset = offset
            .checked_add(consumed)
            .ok_or_else(|| EngineError::corrupt("EUDIC offset overflow"))?;
        block_count += 1;
    }
    if block_count == 0 || offset >= source.len() {
        return Err(EngineError::corrupt("EUDIC record blocks are missing"));
    }

    let mut records = Vec::new();
    let mut previous_key_offset = 0_usize;
    while records.len() < MAX_ENTRIES {
        let entry_offset = offset
            .checked_add(records.len() * 16)
            .ok_or_else(|| EngineError::corrupt("EUDIC table overflow"))?;
        if entry_offset + 16 > source.len() {
            break;
        }
        let key_offset = read_u32(source, entry_offset)? as usize;
        let record_offset = read_u32(source, entry_offset + 4)? as usize;
        let reserved = read_u32(source, entry_offset + 8)?;
        let record_length = read_u32(source, entry_offset + 12)? as usize;
        let record_end = record_offset.checked_add(record_length);
        if reserved != 0
            || key_offset < previous_key_offset
            || record_length == 0
            || record_length > MAX_RECORD_BYTES
            || record_end.is_none_or(|end| end > records_data.len())
        {
            break;
        }
        records.push((key_offset, record_offset, record_length));
        previous_key_offset = key_offset;
    }
    if records.is_empty() || records.len() == MAX_ENTRIES {
        return Err(EngineError::corrupt("invalid EUDIC record table"));
    }
    let table_end = offset
        .checked_add(records.len() * 16)
        .ok_or_else(|| EngineError::corrupt("EUDIC table overflow"))?;
    let key_pool_bytes = read_u32(source, table_end)? as usize;
    if read_u32(source, table_end + 4)? != 0 {
        return Err(EngineError::corrupt("invalid EUDIC table terminator"));
    }
    let key_pool_start = table_end + 8;
    let key_pool_end = key_pool_start
        .checked_add(key_pool_bytes)
        .filter(|end| *end <= source.len())
        .ok_or_else(|| EngineError::corrupt("invalid EUDIC key pool"))?;
    if key_pool_bytes <= records.last().expect("non-empty records").0 {
        return Err(EngineError::corrupt("invalid EUDIC key offsets"));
    }
    let key_pool = &source[key_pool_start..key_pool_end];
    let mut entries = Vec::with_capacity(records.len());
    for (index, &(key_start, record_start, record_length)) in records.iter().enumerate() {
        let key_end = records
            .get(index + 1)
            .map_or(key_pool.len(), |record| record.0);
        if key_end <= key_start || key_end > key_pool.len() {
            return Err(EngineError::corrupt("invalid EUDIC key range"));
        }
        let key = std::str::from_utf8(&key_pool[key_start..key_end])
            .map_err(|_| EngineError::corrupt("invalid EUDIC keyword"))?;
        if key.trim().is_empty() || key.len() > 512 || key.contains('\0') {
            return Err(EngineError::corrupt("invalid EUDIC keyword"));
        }
        let definition_end = record_start + record_length;
        let raw_definition = std::str::from_utf8(&records_data[record_start..definition_end])
            .map_err(|_| EngineError::corrupt("invalid EUDIC definition"))?;
        let file_name = remote_file_name(raw_definition)?;
        let definition = format!(
            "<img src=\"{RESOURCE_PREFIX}{}\" alt=\"{}\">",
            escape_html(file_name),
            escape_html(key),
        );
        entries.push(DictionaryEntry {
            data: definition.into_bytes(),
            key: key.to_owned(),
        });
    }
    Ok(MdictArchive {
        entries,
        kind: MdictKind::Definitions,
        stylesheet: BTreeMap::new(),
    })
}

#[derive(Clone, Copy, Debug)]
struct GeneralRecord {
    key_offset: usize,
    record_length: usize,
    record_offset: u64,
}

#[derive(Clone, Copy, Debug)]
struct EmbeddedResourceDescriptor {
    data_length: usize,
    data_offset: u64,
    name_length: usize,
    name_offset: u64,
}

struct GeneralMetadata {
    block_end: u64,
    block_offsets: Vec<u64>,
    key_pool: Vec<u8>,
    records: Vec<GeneralRecord>,
    resources: MdictArchive,
    script: Option<String>,
    stylesheet: Option<String>,
}

fn compile_general_eudic<S: ReadAt>(
    source: &S,
    sources: Vec<SourceDescriptor>,
) -> Result<CompiledPackage> {
    let metadata = read_general_metadata(source)?;
    let entries = GeneralEntries::new(
        source,
        metadata.block_offsets,
        metadata.block_end,
        metadata.records,
        metadata.key_pool,
    );
    let mut compiler = PackageCompiler::from_entries(
        entries,
        metadata.stylesheet.as_deref(),
        metadata.script.as_deref(),
        None,
        sources,
    )?;
    compiler.add_resources(&metadata.resources)?;
    compiler.finish()
}

fn read_general_metadata<S: ReadAt>(source: &S) -> Result<GeneralMetadata> {
    if source.len() < GENERAL_FIXED_HEADER_BYTES {
        return Err(EngineError::corrupt("truncated EUDIC header"));
    }
    if source.len() > GENERAL_MAX_SOURCE_BYTES {
        return Err(EngineError::limit("EUDIC source is too large"));
    }
    let header = source.read_exact_at(0, 20)?;
    if header.get(..2) != Some(EUDIC_MAGIC.as_slice()) {
        return Err(EngineError::unsupported("unsupported EUDIC dictionary"));
    }
    let metadata_bytes = u64::from(read_u32(&header, 2)?);
    let block_table_offset = GENERAL_FIXED_HEADER_BYTES
        .checked_add(metadata_bytes)
        .ok_or_else(|| EngineError::corrupt("EUDIC header overflow"))?;
    let block_count_bytes = source.read_exact_at(block_table_offset, 4)?;
    let block_count = usize::try_from(read_u32(&block_count_bytes, 0)?)
        .map_err(|_| EngineError::limit("too many EUDIC blocks"))?;
    if block_count == 0
        || block_count > MAX_GENERAL_DECOMPRESSED_BYTES as usize / GENERAL_BLOCK_BYTES
    {
        return Err(EngineError::limit("too many EUDIC blocks"));
    }
    let offsets_bytes_length = block_count
        .checked_mul(8)
        .ok_or_else(|| EngineError::corrupt("EUDIC block table overflow"))?;
    let offsets_bytes = source.read_exact_at(block_table_offset + 4, offsets_bytes_length)?;
    let mut block_offsets = Vec::with_capacity(block_count);
    for index in 0..block_count {
        block_offsets.push(read_u64(&offsets_bytes, index * 8)?);
    }
    let block_marker_offset = block_table_offset + 4 + offsets_bytes_length as u64;
    let marker = source.read_exact_at(block_marker_offset, 1)?[0];
    if marker != 1 || block_offsets.first().copied() != Some(block_marker_offset + 1) {
        return Err(EngineError::corrupt("invalid EUDIC block table"));
    }
    for (index, &offset) in block_offsets.iter().enumerate() {
        if offset >= source.len()
            || index > 0 && offset <= block_offsets[index - 1]
            || index > 0 && offset - block_offsets[index - 1] > MAX_PACKED_BLOCK_BYTES as u64
        {
            return Err(EngineError::corrupt("invalid EUDIC block offset"));
        }
    }
    let last_offset = *block_offsets.last().expect("non-empty blocks");
    let last_available =
        usize::try_from((source.len() - last_offset).min(MAX_PACKED_BLOCK_BYTES as u64))
            .map_err(|_| EngineError::limit("EUDIC block is too large"))?;
    let last_packed = source.read_exact_at(last_offset, last_available)?;
    let (last_consumed, last_block) = inflate_one(&last_packed, GENERAL_BLOCK_BYTES)?;
    if last_block.len() != GENERAL_BLOCK_BYTES {
        return Err(EngineError::corrupt("invalid EUDIC block size"));
    }
    let block_end = last_offset
        .checked_add(last_consumed as u64)
        .ok_or_else(|| EngineError::corrupt("EUDIC block offset overflow"))?;
    let total_unpacked = (block_count as u64)
        .checked_mul(GENERAL_BLOCK_BYTES as u64)
        .ok_or_else(|| EngineError::limit("EUDIC decompressed data is too large"))?;
    let (records, key_pool, key_pool_end) =
        read_general_records(source, block_end, total_unpacked)?;
    let (resources, stylesheet, script) = read_embedded_resources(source, key_pool_end)?;
    Ok(GeneralMetadata {
        block_end,
        block_offsets,
        key_pool,
        records,
        resources,
        script,
        stylesheet,
    })
}

fn read_general_records<S: ReadAt>(
    source: &S,
    records_start: u64,
    total_unpacked: u64,
) -> Result<(Vec<GeneralRecord>, Vec<u8>, u64)> {
    let mut cursor = SourceCursor::new(source, records_start);
    let mut records = Vec::new();
    let mut previous_key_offset = 0_usize;
    let (key_pool_bytes, key_pool_start) = loop {
        if records.len() >= MAX_ENTRIES {
            return Err(EngineError::limit("too many EUDIC entries"));
        }
        let record_pos = cursor.position();
        let remaining = source.len().saturating_sub(record_pos);
        if remaining < 8 {
            return Err(EngineError::corrupt("truncated EUDIC record table"));
        }
        if remaining < 16 {
            let terminator = cursor.read_array::<8>()?;
            let key_pool_bytes = read_u32(&terminator, 0)? as usize;
            if read_u32(&terminator, 4)? != 0 {
                return Err(EngineError::corrupt("invalid EUDIC record table"));
            }
            break (key_pool_bytes, record_pos + 8);
        }
        let value = cursor.read_array::<16>()?;
        let key_offset = read_u32(&value, 0)? as usize;
        let record_offset = read_u64(&value, 4)?;
        let record_length = read_u32(&value, 12)? as usize;
        if records.is_empty() && key_offset == 0 && record_length == 0 {
            continue;
        }
        let valid = key_offset >= previous_key_offset
            && record_length > 0
            && record_length <= MAX_RECORD_BYTES
            && record_offset
                .checked_add(record_length as u64)
                .is_some_and(|end| end <= total_unpacked);
        if valid {
            records.push(GeneralRecord {
                key_offset,
                record_length,
                record_offset,
            });
            previous_key_offset = key_offset;
            continue;
        }
        if read_u32(&value, 4)? != 0 {
            return Err(EngineError::corrupt("invalid EUDIC record table"));
        }
        break (key_offset, record_pos + 8);
    };
    if records.is_empty()
        || key_pool_bytes == 0
        || key_pool_bytes > MAX_KEY_POOL_BYTES
        || key_pool_bytes <= previous_key_offset
    {
        return Err(EngineError::corrupt("invalid EUDIC key pool"));
    }
    let key_pool = source.read_exact_at(key_pool_start, key_pool_bytes)?;
    validate_general_keys(&records, &key_pool)?;
    let key_pool_end = key_pool_start
        .checked_add(key_pool_bytes as u64)
        .ok_or_else(|| EngineError::corrupt("EUDIC key pool overflow"))?;
    Ok((records, key_pool, key_pool_end))
}

fn validate_general_keys(records: &[GeneralRecord], key_pool: &[u8]) -> Result<()> {
    for (index, record) in records.iter().enumerate() {
        let key_end = records
            .get(index + 1)
            .map_or(key_pool.len(), |next| next.key_offset);
        if key_end <= record.key_offset || key_end > key_pool.len() {
            return Err(EngineError::corrupt("invalid EUDIC key range"));
        }
        let key = std::str::from_utf8(&key_pool[record.key_offset..key_end])
            .map_err(|_| EngineError::corrupt("invalid EUDIC keyword"))?;
        if key.trim().is_empty() || key.len() > 512 || key.contains('\0') {
            return Err(EngineError::corrupt("invalid EUDIC keyword"));
        }
    }
    Ok(())
}

fn read_embedded_resources<S: ReadAt>(
    source: &S,
    minimum_offset: u64,
) -> Result<(MdictArchive, Option<String>, Option<String>)> {
    let tail_length = usize::try_from(
        source
            .len()
            .min((MAX_RESOURCES * RESOURCE_DESCRIPTOR_BYTES) as u64),
    )
    .map_err(|_| EngineError::limit("EUDIC resource table is too large"))?;
    let tail_start = source.len() - tail_length as u64;
    let tail = source.read_exact_at(tail_start, tail_length)?;
    let mut descriptors = None;
    for count in 1..=MAX_RESOURCES.min(tail.len() / RESOURCE_DESCRIPTOR_BYTES) {
        let table_start = source.len() - (count * RESOURCE_DESCRIPTOR_BYTES) as u64;
        let local_start = tail.len() - count * RESOURCE_DESCRIPTOR_BYTES;
        let candidate = parse_resource_descriptors(&tail[local_start..], count)?;
        if valid_resource_layout(&candidate, table_start, minimum_offset) {
            if descriptors.is_some() {
                return Err(EngineError::corrupt("ambiguous EUDIC resource table"));
            }
            descriptors = Some(candidate);
        }
    }
    let Some(descriptors) = descriptors else {
        return Ok((empty_resource_archive(), None, None));
    };
    let names_start = descriptors[0].name_offset;
    let names_end = source.len() - (descriptors.len() * RESOURCE_DESCRIPTOR_BYTES) as u64;
    let names_length = usize::try_from(names_end - names_start)
        .map_err(|_| EngineError::limit("EUDIC resource names are too large"))?;
    if names_length > MAX_RESOURCE_NAMES_BYTES {
        return Err(EngineError::limit("EUDIC resource names are too large"));
    }
    let names = source.read_exact_at(names_start, names_length)?;
    let mut entries = Vec::new();
    let mut stylesheets = Vec::new();
    let mut scripts = Vec::new();
    for descriptor in descriptors {
        let name_start = usize::try_from(descriptor.name_offset - names_start)
            .map_err(|_| EngineError::corrupt("invalid EUDIC resource name"))?;
        let name_end = name_start
            .checked_add(descriptor.name_length)
            .filter(|end| *end <= names.len())
            .ok_or_else(|| EngineError::corrupt("invalid EUDIC resource name"))?;
        let name = std::str::from_utf8(&names[name_start..name_end])
            .map_err(|_| EngineError::corrupt("invalid EUDIC resource name"))?;
        if !valid_resource_path(name) {
            return Err(EngineError::corrupt("unsafe EUDIC resource name"));
        }
        let data = source.read_exact_at(descriptor.data_offset, descriptor.data_length)?;
        let lower = name.to_ascii_lowercase();
        let is_root_resource = !name.contains('/') && !name.contains('\\');
        if is_root_resource && lower.ends_with(".css") {
            stylesheets.push(resource_text(
                &data,
                MAX_STYLESHEET_BYTES,
                "EUDIC stylesheet",
            )?);
        } else if is_root_resource && lower.ends_with(".js") {
            scripts.push(resource_text(&data, MAX_SCRIPT_BYTES, "EUDIC script")?);
        }
        // Root CSS/JS files are the EUDIC companion assets and remain available as the
        // package-wide stylesheet/script for existing dictionaries. Keep every asset in the
        // resource index as well so original link/script/import/worker paths still resolve.
        entries.push(DictionaryEntry {
            data,
            key: name.to_owned(),
        });
    }
    let stylesheet = joined_resource_text(stylesheets, MAX_STYLESHEET_BYTES, "EUDIC stylesheet")?;
    let script = joined_resource_text(scripts, MAX_SCRIPT_BYTES, "EUDIC script")?;
    Ok((
        MdictArchive {
            entries,
            kind: MdictKind::Resources,
            stylesheet: BTreeMap::new(),
        },
        stylesheet,
        script,
    ))
}

fn parse_resource_descriptors(
    bytes: &[u8],
    count: usize,
) -> Result<Vec<EmbeddedResourceDescriptor>> {
    let mut result = Vec::with_capacity(count);
    for index in 0..count {
        let offset = index * RESOURCE_DESCRIPTOR_BYTES;
        result.push(EmbeddedResourceDescriptor {
            name_offset: read_u64(bytes, offset)?,
            name_length: read_u32(bytes, offset + 8)? as usize,
            data_offset: read_u64(bytes, offset + 12)?,
            data_length: read_u32(bytes, offset + 20)? as usize,
        });
    }
    Ok(result)
}

fn valid_resource_layout(
    descriptors: &[EmbeddedResourceDescriptor],
    table_start: u64,
    minimum_offset: u64,
) -> bool {
    let Some(first) = descriptors.first() else {
        return false;
    };
    if first.name_offset < minimum_offset || first.data_offset < minimum_offset {
        return false;
    }
    let mut next_name = first.name_offset;
    let mut next_data = first.data_offset;
    for descriptor in descriptors {
        if descriptor.name_offset != next_name
            || descriptor.data_offset != next_data
            || descriptor.name_length == 0
            || descriptor.name_length > 512
            || descriptor.data_length == 0
            || descriptor.data_length > MAX_RESOURCE_BYTES
        {
            return false;
        }
        let Some(name_end) = descriptor
            .name_offset
            .checked_add(descriptor.name_length as u64)
        else {
            return false;
        };
        let Some(data_end) = descriptor
            .data_offset
            .checked_add(descriptor.data_length as u64)
        else {
            return false;
        };
        next_name = name_end;
        next_data = data_end;
    }
    next_name == table_start && next_data == first.name_offset
}

fn empty_resource_archive() -> MdictArchive {
    MdictArchive {
        entries: Vec::new(),
        kind: MdictKind::Resources,
        stylesheet: BTreeMap::new(),
    }
}

fn resource_text(data: &[u8], limit: usize, label: &'static str) -> Result<String> {
    if data.len() > limit {
        return Err(EngineError::limit(label));
    }
    let value = std::str::from_utf8(data).map_err(|_| EngineError::corrupt(label))?;
    Ok(value.trim_start_matches('\u{feff}').to_owned())
}

fn joined_resource_text(
    values: Vec<String>,
    limit: usize,
    label: &'static str,
) -> Result<Option<String>> {
    if values.is_empty() {
        return Ok(None);
    }
    let result = values.join("\n");
    if result.len() > limit {
        return Err(EngineError::limit(label));
    }
    Ok(Some(result))
}

fn valid_resource_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && !value.starts_with('/')
        && !value.contains('\0')
        && !value.contains(':')
        && !value.replace('\\', "/").split('/').any(|part| part == "..")
}

struct GeneralEntries<'a, S: ReadAt> {
    blocks: GeneralBlockReader<'a, S>,
    index: usize,
    key_pool: Vec<u8>,
    records: Vec<GeneralRecord>,
}

impl<'a, S: ReadAt> GeneralEntries<'a, S> {
    fn new(
        source: &'a S,
        block_offsets: Vec<u64>,
        block_end: u64,
        records: Vec<GeneralRecord>,
        key_pool: Vec<u8>,
    ) -> Self {
        Self {
            blocks: GeneralBlockReader::new(source, block_offsets, block_end),
            index: 0,
            key_pool,
            records,
        }
    }
}

impl<S: ReadAt> Iterator for GeneralEntries<'_, S> {
    type Item = Result<DictionaryEntry>;

    fn next(&mut self) -> Option<Self::Item> {
        let record = *self.records.get(self.index)?;
        let key_end = self
            .records
            .get(self.index + 1)
            .map_or(self.key_pool.len(), |next| next.key_offset);
        self.index += 1;
        let key = match std::str::from_utf8(&self.key_pool[record.key_offset..key_end]) {
            Ok(value) => value.to_owned(),
            Err(_) => return Some(Err(EngineError::corrupt("invalid EUDIC keyword"))),
        };
        let definition = match self.blocks.read(record.record_offset, record.record_length) {
            Ok(value) => value,
            Err(error) => return Some(Err(error)),
        };
        let definition = match String::from_utf8(definition) {
            Ok(value) if !value.contains('\0') => value,
            _ => return Some(Err(EngineError::corrupt("invalid EUDIC definition"))),
        };
        Some(Ok(DictionaryEntry {
            data: definition.into_bytes(),
            key,
        }))
    }
}

struct GeneralBlockReader<'a, S: ReadAt> {
    block_end: u64,
    cache: VecDeque<(usize, Vec<u8>)>,
    offsets: Vec<u64>,
    source: &'a S,
}

impl<'a, S: ReadAt> GeneralBlockReader<'a, S> {
    fn new(source: &'a S, offsets: Vec<u64>, block_end: u64) -> Self {
        Self {
            block_end,
            cache: VecDeque::new(),
            offsets,
            source,
        }
    }

    fn read(&mut self, offset: u64, length: usize) -> Result<Vec<u8>> {
        let mut output = Vec::with_capacity(length);
        let mut remaining = length;
        let mut position = offset;
        while remaining > 0 {
            let block_index = usize::try_from(position / GENERAL_BLOCK_BYTES as u64)
                .map_err(|_| EngineError::corrupt("EUDIC record offset overflow"))?;
            let inner = usize::try_from(position % GENERAL_BLOCK_BYTES as u64)
                .map_err(|_| EngineError::corrupt("EUDIC record offset overflow"))?;
            let take = remaining.min(GENERAL_BLOCK_BYTES - inner);
            let block = self.block(block_index)?;
            output.extend_from_slice(&block[inner..inner + take]);
            position = position
                .checked_add(take as u64)
                .ok_or_else(|| EngineError::corrupt("EUDIC record offset overflow"))?;
            remaining -= take;
        }
        Ok(output)
    }

    fn block(&mut self, index: usize) -> Result<&[u8]> {
        if let Some(position) = self
            .cache
            .iter()
            .position(|(candidate, _)| *candidate == index)
        {
            let cached = self.cache.remove(position).expect("cache position exists");
            self.cache.push_back(cached);
            return Ok(&self.cache.back().expect("cache is non-empty").1);
        }
        let start = *self
            .offsets
            .get(index)
            .ok_or_else(|| EngineError::corrupt("invalid EUDIC record block"))?;
        let end = self
            .offsets
            .get(index + 1)
            .copied()
            .unwrap_or(self.block_end);
        let packed_length = usize::try_from(
            end.checked_sub(start)
                .filter(|length| *length > 0 && *length <= MAX_PACKED_BLOCK_BYTES as u64)
                .ok_or_else(|| EngineError::corrupt("invalid EUDIC block range"))?,
        )
        .map_err(|_| EngineError::limit("EUDIC block is too large"))?;
        let packed = self.source.read_exact_at(start, packed_length)?;
        let (consumed, block) = inflate_one(&packed, GENERAL_BLOCK_BYTES)?;
        if consumed != packed.len() || block.len() != GENERAL_BLOCK_BYTES {
            return Err(EngineError::corrupt("invalid EUDIC block size"));
        }
        if self.cache.len() == BLOCK_CACHE_SIZE {
            self.cache.pop_front();
        }
        self.cache.push_back((index, block));
        Ok(&self.cache.back().expect("cache is non-empty").1)
    }
}

struct SourceCursor<'a, S: ReadAt> {
    buffer: Vec<u8>,
    buffer_offset: u64,
    offset: u64,
    source: &'a S,
}

impl<'a, S: ReadAt> SourceCursor<'a, S> {
    fn new(source: &'a S, offset: u64) -> Self {
        Self {
            buffer: Vec::new(),
            buffer_offset: offset,
            offset,
            source,
        }
    }

    fn position(&self) -> u64 {
        self.offset
    }

    fn read_array<const N: usize>(&mut self) -> Result<[u8; N]> {
        let buffer_end = self.buffer_offset + self.buffer.len() as u64;
        if self.offset < self.buffer_offset || self.offset + N as u64 > buffer_end {
            let available = self.source.len().checked_sub(self.offset).unwrap_or(0);
            let length = usize::try_from(available.min(SOURCE_READ_BYTES as u64))
                .map_err(|_| EngineError::corrupt("EUDIC cursor overflow"))?;
            if length < N {
                return Err(EngineError::corrupt("truncated EUDIC structure"));
            }
            self.buffer = self.source.read_exact_at(self.offset, length)?;
            self.buffer_offset = self.offset;
        }
        let start = usize::try_from(self.offset - self.buffer_offset)
            .map_err(|_| EngineError::corrupt("EUDIC cursor overflow"))?;
        let end = start + N;
        let value = self.buffer[start..end]
            .try_into()
            .expect("fixed cursor length");
        self.offset += N as u64;
        Ok(value)
    }
}

fn inflate_one(input: &[u8], max_output: usize) -> Result<(usize, Vec<u8>)> {
    let mut state = InflateState::new(DataFormat::Zlib);
    let mut consumed = 0_usize;
    let mut output = Vec::new();
    loop {
        if output.len() >= max_output {
            return Err(EngineError::limit("EUDIC block is too large"));
        }
        let mut buffer = vec![0_u8; (max_output - output.len()).min(64 * 1_024)];
        let result = inflate(&mut state, &input[consumed..], &mut buffer, MZFlush::None);
        consumed = consumed
            .checked_add(result.bytes_consumed)
            .ok_or_else(|| EngineError::corrupt("EUDIC zlib offset overflow"))?;
        output.extend_from_slice(&buffer[..result.bytes_written]);
        match result.status {
            Ok(MZStatus::StreamEnd) => return Ok((consumed, output)),
            Ok(_) if result.bytes_consumed > 0 || result.bytes_written > 0 => {}
            _ => return Err(EngineError::corrupt("invalid EUDIC zlib block")),
        }
    }
}

fn remote_file_name(definition: &str) -> Result<&str> {
    let source = ["src=\"", "src='"]
        .into_iter()
        .find_map(|marker| {
            let start = definition.find(marker)? + marker.len();
            let quote = marker.as_bytes().last().copied()? as char;
            let end = definition[start..].find(quote)? + start;
            Some(&definition[start..end])
        })
        .ok_or_else(|| EngineError::corrupt("EUDIC image source is missing"))?;
    let file_name = source
        .strip_prefix(REMOTE_PREFIX)
        .ok_or_else(|| EngineError::corrupt("EUDIC image origin is not allowed"))?;
    if !valid_jpeg_name(file_name) {
        return Err(EngineError::corrupt("invalid EUDIC image name"));
    }
    Ok(file_name)
}

fn valid_jpeg_name(value: &str) -> bool {
    (5..=244).contains(&value.len())
        && value.to_ascii_lowercase().ends_with(".jpg")
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric()
                || (index > 0 && matches!(byte, b'.' | b'_' | b'\'' | b'-'))
        })
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn read_u16(source: &[u8], offset: usize) -> Result<u16> {
    let bytes = source
        .get(offset..offset + 2)
        .ok_or_else(|| EngineError::corrupt("truncated EUDIC input"))?;
    Ok(u16::from_le_bytes(bytes.try_into().expect("fixed length")))
}

fn read_u32(source: &[u8], offset: usize) -> Result<u32> {
    let bytes = source
        .get(offset..offset + 4)
        .ok_or_else(|| EngineError::corrupt("truncated EUDIC input"))?;
    Ok(u32::from_le_bytes(bytes.try_into().expect("fixed length")))
}

fn read_u64(source: &[u8], offset: usize) -> Result<u64> {
    let bytes = source
        .get(offset..offset + 8)
        .ok_or_else(|| EngineError::corrupt("truncated EUDIC input"))?;
    Ok(u64::from_le_bytes(bytes.try_into().expect("fixed length")))
}

fn is_zlib_header(source: &[u8], offset: usize) -> bool {
    let Some(&compression) = source.get(offset) else {
        return false;
    };
    let Some(&flags) = source.get(offset + 1) else {
        return false;
    };
    (compression & 0x0f) == 8
        && compression >> 4 <= 7
        && ((u16::from(compression) << 8) | u16::from(flags)) % 31 == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use miniz_oxide::deflate::compress_to_vec_zlib;

    fn push_u32(output: &mut Vec<u8>, value: usize) {
        output.extend_from_slice(&(value as u32).to_le_bytes());
    }

    fn push_u64(output: &mut Vec<u8>, value: usize) {
        output.extend_from_slice(&(value as u64).to_le_bytes());
    }

    fn image_fixture(url: &str) -> Vec<u8> {
        let definition = format!("<img src=\"{url}\">");
        let compressed = compress_to_vec_zlib(definition.as_bytes(), 3);
        let mut output = vec![0_u8; 20];
        output[..2].copy_from_slice(&EUDIC_MAGIC);
        output[6..8].copy_from_slice(&20_u16.to_le_bytes());
        output.extend_from_slice(&compressed);
        push_u32(&mut output, 0);
        push_u32(&mut output, 0);
        push_u32(&mut output, 0);
        push_u32(&mut output, definition.len());
        push_u32(&mut output, 5);
        push_u32(&mut output, 0);
        output.extend_from_slice(b"hello");
        output
    }

    fn general_fixture() -> Vec<u8> {
        let definitions = [
            (
                "alpha",
                "<link rel=\"stylesheet\" href=\"eures://styles/theme.css\"><b>alpha</b><img src=\"eures://icon.png\"><script src=\"eures://scripts/control.js\"></script>",
            ),
            ("beta", "<a href=\"dic://alpha\">beta</a>"),
        ];
        let mut raw = vec![0_u8; GENERAL_BLOCK_BYTES];
        let mut records = Vec::new();
        let mut record_offset = 0_usize;
        let mut key_pool = Vec::new();
        for (key, definition) in definitions {
            let key_offset = key_pool.len();
            key_pool.extend_from_slice(key.as_bytes());
            raw[record_offset..record_offset + definition.len()]
                .copy_from_slice(definition.as_bytes());
            records.push((key_offset, record_offset, definition.len()));
            record_offset += definition.len();
        }
        let packed = compress_to_vec_zlib(&raw, 3);
        let mut output = vec![0_u8; GENERAL_FIXED_HEADER_BYTES as usize + 432];
        output[..2].copy_from_slice(&EUDIC_MAGIC);
        output[2..6].copy_from_slice(&432_u32.to_le_bytes());
        push_u32(&mut output, 1);
        let block_offset = output.len() + 8 + 1;
        push_u64(&mut output, block_offset);
        output.push(1);
        output.extend_from_slice(&packed);
        for (key_offset, definition_offset, definition_length) in records {
            push_u32(&mut output, key_offset);
            push_u64(&mut output, definition_offset);
            push_u32(&mut output, definition_length);
        }
        push_u32(&mut output, key_pool.len());
        push_u32(&mut output, 0);
        output.extend_from_slice(&key_pool);

        let resources = [
            (
                "etyma.css",
                b".x{background:url(eures://icon.png)}".as_slice(),
            ),
            (
                "etyma.js",
                b"document.body.dataset.asset='eures://settings.json'".as_slice(),
            ),
            ("styles/theme.css", b".entry{display:block}".as_slice()),
            (
                "scripts/control.js",
                b"document.body.dataset.ready='1'".as_slice(),
            ),
            ("settings.json", br#"{"enabled":true}"#.as_slice()),
            ("icon.png", b"\x89PNG\r\n\x1a\nfixture".as_slice()),
        ];
        let mut descriptors = Vec::new();
        let mut data_offsets = Vec::new();
        for (_, data) in resources {
            data_offsets.push((output.len(), data.len()));
            output.extend_from_slice(data);
        }
        let mut name_offsets = Vec::new();
        for (name, _) in resources {
            name_offsets.push((output.len(), name.len()));
            output.extend_from_slice(name.as_bytes());
        }
        for ((name_offset, name_length), (data_offset, data_length)) in
            name_offsets.into_iter().zip(data_offsets)
        {
            push_u64(&mut descriptors, name_offset);
            push_u32(&mut descriptors, name_length);
            push_u64(&mut descriptors, data_offset);
            push_u32(&mut descriptors, data_length);
        }
        output.extend_from_slice(&descriptors);
        output
    }

    #[test]
    fn parses_eudic_with_fixed_remote_resource() {
        let archive = read_eudic(&image_fixture(&format!("{REMOTE_PREFIX}hello.jpg"))).unwrap();
        assert_eq!(archive.entries[0].key, "hello");
        assert_eq!(
            archive.entries[0].data,
            b"<img src=\"eudic-word-card-en-v2/hello.jpg\" alt=\"hello\">"
        );
    }

    #[test]
    fn rejects_other_remote_origins() {
        assert!(read_eudic(&image_fixture("https://example.com/hello.jpg")).is_err());
    }

    #[test]
    fn compiles_general_eudic_entries_and_embedded_resources() {
        let fixture = general_fixture();
        let source = crate::SliceSource(&fixture);
        let package = compile_eudic(&source, Vec::new()).unwrap();
        assert_eq!(package.manifest.entry_count, 2);
        assert_eq!(package.manifest.remote_resource_kind, None);
        assert_eq!(
            package.files.get("style.css").unwrap(),
            b".x{background:url(eures://icon.png)}"
        );
        assert_eq!(
            package.files.get("script.js").unwrap(),
            b"document.body.dataset.asset='eures://settings.json'"
        );
        assert!(!package.manifest.resources.is_empty());
        let resource_index = &package.manifest.resources[0].file;
        let resources: serde_json::Value =
            serde_json::from_slice(package.files.get(resource_index).unwrap()).unwrap();
        for path in [
            "etyma.css",
            "etyma.js",
            "icon.png",
            "scripts/control.js",
            "settings.json",
            "styles/theme.css",
        ] {
            assert!(
                resources.get(path).is_some(),
                "missing EUDIC resource {path}"
            );
        }
        let records_file = &package.manifest.record_frames[0].file;
        let records_pack = package.files.get(records_file).unwrap();
        let frame = &package.manifest.record_frames[0];
        let packed = &records_pack[frame.offset as usize..(frame.offset + frame.length) as usize];
        let records = match frame.codec {
            crate::package::FrameCodec::Deflate => {
                miniz_oxide::inflate::decompress_to_vec_zlib(packed).unwrap()
            }
            crate::package::FrameCodec::None => packed.to_vec(),
        };
        let records: serde_json::Value = serde_json::from_slice(&records).unwrap();
        assert!(records[0]["definition"]
            .as_str()
            .unwrap()
            .contains("eures://scripts/control.js"));
    }

    #[test]
    fn compiles_general_eudic_with_variable_metadata_and_leading_zero_length_record() {
        let definitions = [("hello", "<b>world</b>")];
        let mut raw = vec![0_u8; GENERAL_BLOCK_BYTES];
        let mut records = Vec::new();
        let mut record_offset = 0_usize;
        let mut key_pool = Vec::new();
        for (key, definition) in definitions {
            let key_offset = key_pool.len();
            key_pool.extend_from_slice(key.as_bytes());
            raw[record_offset..record_offset + definition.len()]
                .copy_from_slice(definition.as_bytes());
            records.push((key_offset, record_offset, definition.len()));
            record_offset += definition.len();
        }
        let packed = compress_to_vec_zlib(&raw, 3);
        let metadata_len: usize = 464;
        let mut output = vec![0_u8; GENERAL_FIXED_HEADER_BYTES as usize + metadata_len];
        output[..2].copy_from_slice(&EUDIC_MAGIC);
        output[2..6].copy_from_slice(&(metadata_len as u32).to_le_bytes());
        push_u32(&mut output, 1);
        let block_offset = output.len() + 8 + 1;
        push_u64(&mut output, block_offset);
        output.push(1);
        output.extend_from_slice(&packed);
        // Add leading dummy header record with record_length = 0 and record_offset = total_unpacked
        push_u32(&mut output, 0);
        push_u64(&mut output, GENERAL_BLOCK_BYTES);
        push_u32(&mut output, 0);
        for (key_offset, definition_offset, definition_length) in records {
            push_u32(&mut output, key_offset);
            push_u64(&mut output, definition_offset);
            push_u32(&mut output, definition_length);
        }
        push_u32(&mut output, key_pool.len());
        push_u32(&mut output, 0);
        output.extend_from_slice(&key_pool);

        let source = crate::SliceSource(&output);
        let package = compile_eudic(&source, Vec::new()).unwrap();
        assert_eq!(package.manifest.entry_count, 1);
    }

    #[test]
    fn rejects_general_eudic_with_unsafe_resource_paths() {
        let mut fixture = general_fixture();
        let name = fixture
            .windows("icon.png".len())
            .rposition(|value| value == b"icon.png")
            .unwrap();
        fixture[name..name + "icon.png".len()].copy_from_slice(b"../x.png");
        assert!(compile_eudic(&crate::SliceSource(&fixture), Vec::new()).is_err());
    }

    #[test]
    fn rejects_general_eudic_with_out_of_range_block_offsets() {
        let mut fixture = general_fixture();
        let block_offset_position = GENERAL_FIXED_HEADER_BYTES as usize + 432 + 4;
        let invalid_offset = fixture.len() as u64 + 1;
        fixture[block_offset_position..block_offset_position + 8]
            .copy_from_slice(&invalid_offset.to_le_bytes());
        assert!(compile_eudic(&crate::SliceSource(&fixture), Vec::new()).is_err());
    }

    #[test]
    fn rejects_general_eudic_with_invalid_zlib_blocks() {
        let mut fixture = general_fixture();
        let block_offset_position = GENERAL_FIXED_HEADER_BYTES as usize + 432 + 4;
        let block_offset = read_u64(&fixture, block_offset_position).unwrap() as usize;
        fixture[block_offset] = 0;
        assert!(compile_eudic(&crate::SliceSource(&fixture), Vec::new()).is_err());
    }
}
