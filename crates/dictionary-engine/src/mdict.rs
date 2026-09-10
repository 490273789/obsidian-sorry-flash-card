use std::collections::BTreeMap;

use encoding_rs::{BIG5, GBK, UTF_8};
use quick_xml::{events::Event, Reader};
use ripemd::{Digest, Ripemd128};

use crate::{
    error::{EngineError, Result},
    source::{checked_range, ReadAt},
};

const MAX_HEADER_BYTES: usize = 1_048_576;
const MAX_INDEX_BYTES: usize = 64 * 1_048_576;
const MAX_BLOCK_BYTES: usize = 128 * 1_048_576;
const MAX_ENTRY_BYTES: usize = 16 * 1_048_576;
const MAX_ENTRIES: u64 = 20_000_000;
const MAX_BLOCKS: u64 = 2_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MdictKind {
    Definitions,
    Resources,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DictionaryEntry {
    pub data: Vec<u8>,
    pub key: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MdictArchive {
    pub entries: Vec<DictionaryEntry>,
    pub kind: MdictKind,
    pub stylesheet: BTreeMap<u32, (String, String)>,
}

#[derive(Clone, Copy, Debug)]
enum TextEncoding {
    Utf8,
    Utf16Le,
    Gb18030,
    Big5,
}

#[derive(Clone, Debug)]
struct Header {
    encrypted: u32,
    encoding: TextEncoding,
    kind: MdictKind,
    stylesheet: BTreeMap<u32, (String, String)>,
    version: f64,
}

#[derive(Clone, Debug)]
struct KeyEntry {
    end: u64,
    key: String,
    start: u64,
}

#[derive(Clone, Copy, Debug)]
struct RecordBlock {
    packed: u64,
    unpacked: u64,
}

struct Cursor<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Cursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn remaining(&self) -> usize {
        self.bytes.len().saturating_sub(self.offset)
    }

    fn take(&mut self, length: usize) -> Result<&'a [u8]> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or_else(|| EngineError::corrupt("cursor overflow"))?;
        let result = self
            .bytes
            .get(self.offset..end)
            .ok_or_else(|| EngineError::corrupt("truncated structure"))?;
        self.offset = end;
        Ok(result)
    }

    fn u8(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }

    fn u16_be(&mut self) -> Result<u16> {
        let value: [u8; 2] = self.take(2)?.try_into().expect("fixed length");
        Ok(u16::from_be_bytes(value))
    }

    fn u32_be(&mut self) -> Result<u32> {
        let value: [u8; 4] = self.take(4)?.try_into().expect("fixed length");
        Ok(u32::from_be_bytes(value))
    }

    fn u64_be(&mut self) -> Result<u64> {
        let value: [u8; 8] = self.take(8)?.try_into().expect("fixed length");
        Ok(u64::from_be_bytes(value))
    }

    fn number(&mut self, width: usize) -> Result<u64> {
        match width {
            4 => Ok(u64::from(self.u32_be()?)),
            8 => self.u64_be(),
            _ => Err(EngineError::corrupt("invalid integer width")),
        }
    }
}

impl MdictArchive {
    pub fn read(source: &impl ReadAt, kind: MdictKind) -> Result<Self> {
        let (header, mut offset) = parse_header(source, kind)?;
        let width = if header.version >= 2.0 { 8 } else { 4 };
        let keyword_header_bytes = if width == 8 { 44 } else { 16 };
        checked_range(source.len(), offset, keyword_header_bytes)?;
        let keyword_header = source.read_exact_at(offset, keyword_header_bytes as usize)?;
        offset += keyword_header_bytes;
        let mut cursor = Cursor::new(&keyword_header);
        let block_count = cursor.number(width)?;
        let entry_count = cursor.number(width)?;
        if block_count > MAX_BLOCKS || entry_count > MAX_ENTRIES {
            return Err(EngineError::limit("keyword limits exceeded"));
        }
        let index_unpacked = if width == 8 { cursor.number(width)? } else { 0 };
        let index_packed = cursor.number(width)?;
        let blocks_packed = cursor.number(width)?;
        if width == 8 {
            let _checksum = cursor.u32_be()?;
        }
        let index_packed_usize = limited_usize(index_packed, MAX_INDEX_BYTES, "keyword index")?;
        checked_range(source.len(), offset, index_packed)?;
        let mut index = source.read_exact_at(offset, index_packed_usize)?;
        offset += index_packed;
        if header.encrypted & 2 != 0 {
            decrypt_keyword_index(&mut index)?;
        }
        let index = if width == 8 {
            decode_block(
                &index,
                limited_usize(index_unpacked, MAX_INDEX_BYTES, "keyword index")?,
            )?
        } else {
            index
        };
        let key_block_sizes = parse_key_block_index(&index, width, header.encoding, block_count)?;
        if key_block_sizes.iter().try_fold(0_u64, |sum, block| {
            sum.checked_add(block.0)
                .ok_or_else(|| EngineError::corrupt("keyword block size overflow"))
        })? != blocks_packed
        {
            return Err(EngineError::corrupt("keyword block size mismatch"));
        }
        let mut keys = Vec::with_capacity(usize::try_from(entry_count).unwrap_or(0));
        for (packed, unpacked) in key_block_sizes {
            let packed_size = limited_usize(packed, MAX_BLOCK_BYTES, "keyword block")?;
            let unpacked_size = limited_usize(unpacked, MAX_BLOCK_BYTES, "keyword block")?;
            checked_range(source.len(), offset, packed)?;
            let compressed = source.read_exact_at(offset, packed_size)?;
            offset += packed;
            let block = decode_block(&compressed, unpacked_size)?;
            parse_key_block(&block, width, header.encoding, kind, &mut keys)?;
        }
        if keys.len() as u64 != entry_count {
            return Err(EngineError::corrupt("keyword count mismatch"));
        }

        let record_header_bytes = width * 4;
        checked_range(source.len(), offset, record_header_bytes as u64)?;
        let record_header = source.read_exact_at(offset, record_header_bytes)?;
        offset += record_header_bytes as u64;
        let mut cursor = Cursor::new(&record_header);
        let record_block_count = cursor.number(width)?;
        let record_entry_count = cursor.number(width)?;
        let record_info_bytes = cursor.number(width)?;
        let record_blocks_bytes = cursor.number(width)?;
        if record_block_count > MAX_BLOCKS || record_entry_count != entry_count {
            return Err(EngineError::corrupt("record header mismatch"));
        }
        let expected_record_info = record_block_count
            .checked_mul((width * 2) as u64)
            .ok_or_else(|| EngineError::corrupt("record index overflow"))?;
        if record_info_bytes != expected_record_info {
            return Err(EngineError::corrupt("record index size mismatch"));
        }
        let info_size = limited_usize(record_info_bytes, MAX_INDEX_BYTES, "record index")?;
        checked_range(source.len(), offset, record_info_bytes)?;
        let record_info = source.read_exact_at(offset, info_size)?;
        offset += record_info_bytes;
        let mut info_cursor = Cursor::new(&record_info);
        let mut record_blocks = Vec::with_capacity(record_block_count as usize);
        let mut total_unpacked = 0_u64;
        let mut total_packed = 0_u64;
        for _ in 0..record_block_count {
            let packed = info_cursor.number(width)?;
            let unpacked = info_cursor.number(width)?;
            limited_usize(packed, MAX_BLOCK_BYTES, "record block")?;
            limited_usize(unpacked, MAX_BLOCK_BYTES, "record block")?;
            total_packed = total_packed
                .checked_add(packed)
                .ok_or_else(|| EngineError::corrupt("record size overflow"))?;
            total_unpacked = total_unpacked
                .checked_add(unpacked)
                .ok_or_else(|| EngineError::corrupt("record size overflow"))?;
            record_blocks.push(RecordBlock { packed, unpacked });
        }
        if total_packed != record_blocks_bytes {
            return Err(EngineError::corrupt("record block size mismatch"));
        }
        checked_range(source.len(), offset, record_blocks_bytes)?;
        for index in 0..keys.len() {
            keys[index].end = keys
                .get(index + 1)
                .map_or(total_unpacked, |entry| entry.start);
            if keys[index].end < keys[index].start {
                return Err(EngineError::corrupt("record offsets are not ordered"));
            }
        }
        let entries = read_records(
            source,
            offset,
            &record_blocks,
            &keys,
            header.kind,
            header.encoding,
        )?;
        Ok(Self {
            entries,
            kind,
            stylesheet: header.stylesheet,
        })
    }
}

fn parse_header(source: &impl ReadAt, kind: MdictKind) -> Result<(Header, u64)> {
    checked_range(source.len(), 0, 4)?;
    let size = u32::from_be_bytes(
        source.read_exact_at(0, 4)?[..]
            .try_into()
            .expect("fixed length"),
    ) as usize;
    if size == 0 || size > MAX_HEADER_BYTES || !size.is_multiple_of(2) {
        return Err(EngineError::unsupported("invalid MDict header"));
    }
    checked_range(source.len(), 4, size as u64 + 4)?;
    let bytes = source.read_exact_at(4, size)?;
    let checksum = source.read_exact_at(4 + size as u64, 4)?;
    let checksum: [u8; 4] = checksum[..].try_into().expect("fixed length");
    let actual = adler32(&bytes);
    if actual != u32::from_le_bytes(checksum) && actual != u32::from_be_bytes(checksum) {
        return Err(EngineError::corrupt("header checksum mismatch"));
    }
    let units = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect::<Vec<_>>();
    let xml =
        String::from_utf16(&units).map_err(|_| EngineError::corrupt("invalid header text"))?;
    let attributes = xml_attributes(xml.trim_matches('\0'))?;
    let version = attributes
        .get("GeneratedByEngineVersion")
        .or_else(|| attributes.get("RequiredEngineVersion"))
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(1.2);
    if !(1.0..3.0).contains(&version) {
        return Err(EngineError::unsupported("unsupported MDict engine version"));
    }
    let encrypted = parse_encrypted_attribute(attributes.get("Encrypted"));
    if encrypted & !2 != 0 {
        return Err(EngineError::encrypted(
            "registered or device-bound dictionary",
        ));
    }
    let encoding = if kind == MdictKind::Resources {
        TextEncoding::Utf16Le
    } else {
        parse_encoding(
            attributes
                .get("Encoding")
                .map(String::as_str)
                .unwrap_or("UTF-8"),
        )?
    };
    let stylesheet = parse_stylesheet(attributes.get("StyleSheet"));
    Ok((
        Header {
            encrypted,
            encoding,
            kind,
            stylesheet,
            version,
        },
        8 + size as u64,
    ))
}

fn parse_encrypted_attribute(value: Option<&String>) -> u32 {
    let Some(value) = value else { return 0 };
    let value = value.trim();
    if value.eq_ignore_ascii_case("no") {
        0
    } else if value.eq_ignore_ascii_case("yes") {
        1
    } else {
        value.parse::<u32>().unwrap_or(1)
    }
}

fn xml_attributes(xml: &str) -> Result<BTreeMap<String, String>> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) | Ok(Event::Empty(element)) => {
                let mut result = BTreeMap::new();
                for attribute in element.attributes() {
                    let attribute =
                        attribute.map_err(|_| EngineError::corrupt("invalid header XML"))?;
                    let key = std::str::from_utf8(attribute.key.as_ref())
                        .map_err(|_| EngineError::corrupt("invalid header attribute"))?;
                    let value = attribute
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|_| EngineError::corrupt("invalid header attribute"))?;
                    result.insert(key.to_owned(), value.into_owned());
                }
                return Ok(result);
            }
            Ok(Event::Eof) | Err(_) => return Err(EngineError::corrupt("invalid header XML")),
            _ => {}
        }
    }
}

fn parse_encoding(value: &str) -> Result<TextEncoding> {
    match value.to_ascii_lowercase().replace(['-', '_'], "").as_str() {
        "utf8" => Ok(TextEncoding::Utf8),
        "utf16" | "utf16le" => Ok(TextEncoding::Utf16Le),
        "gb18030" | "gbk" | "gb2312" => Ok(TextEncoding::Gb18030),
        "big5" => Ok(TextEncoding::Big5),
        _ => Err(EngineError::unsupported("unsupported dictionary encoding")),
    }
}

fn parse_stylesheet(value: Option<&String>) -> BTreeMap<u32, (String, String)> {
    let mut result = BTreeMap::new();
    let Some(value) = value else { return result };
    let lines = value
        .split(['\n', '\r'])
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    for chunk in lines.chunks_exact(3) {
        if let Ok(id) = chunk[0].parse::<u32>() {
            result.insert(id, (chunk[1].to_owned(), chunk[2].to_owned()));
        }
    }
    result
}

fn parse_key_block_index(
    bytes: &[u8],
    width: usize,
    encoding: TextEncoding,
    expected_blocks: u64,
) -> Result<Vec<(u64, u64)>> {
    let mut cursor = Cursor::new(bytes);
    let mut result = Vec::with_capacity(expected_blocks as usize);
    while cursor.remaining() > 0 {
        let _entries = cursor.number(width)?;
        let first_length = if width == 8 {
            cursor.u16_be()? as usize
        } else {
            cursor.u8()? as usize
        };
        let first_bytes = encoded_byte_length(encoding, first_length)?;
        cursor.take(first_bytes)?;
        cursor.take(null_width(encoding))?;
        let last_length = if width == 8 {
            cursor.u16_be()? as usize
        } else {
            cursor.u8()? as usize
        };
        let last_bytes = encoded_byte_length(encoding, last_length)?;
        cursor.take(last_bytes)?;
        cursor.take(null_width(encoding))?;
        let packed = cursor.number(width)?;
        let unpacked = cursor.number(width)?;
        result.push((packed, unpacked));
        if result.len() as u64 > expected_blocks {
            return Err(EngineError::corrupt("too many keyword blocks"));
        }
    }
    if result.len() as u64 != expected_blocks {
        return Err(EngineError::corrupt("keyword block count mismatch"));
    }
    Ok(result)
}

fn parse_key_block(
    bytes: &[u8],
    width: usize,
    encoding: TextEncoding,
    kind: MdictKind,
    output: &mut Vec<KeyEntry>,
) -> Result<()> {
    let mut cursor = Cursor::new(bytes);
    while cursor.remaining() > 0 {
        let start = cursor.number(width)?;
        let key_bytes = take_c_string(&mut cursor, encoding)?;
        let mut key = decode_text(key_bytes, encoding)?;
        if kind == MdictKind::Resources {
            key = key.replace('\\', "/").trim_start_matches('/').to_owned();
        }
        output.push(KeyEntry {
            end: start,
            key,
            start,
        });
        if output.len() as u64 > MAX_ENTRIES {
            return Err(EngineError::limit("too many dictionary entries"));
        }
    }
    Ok(())
}

fn take_c_string<'a>(cursor: &mut Cursor<'a>, encoding: TextEncoding) -> Result<&'a [u8]> {
    let start = cursor.offset;
    let width = null_width(encoding);
    let mut position = start;
    while position + width <= cursor.bytes.len() {
        if cursor.bytes[position..position + width]
            .iter()
            .all(|byte| *byte == 0)
        {
            let value = &cursor.bytes[start..position];
            cursor.offset = position + width;
            return Ok(value);
        }
        position = position
            .checked_add(width)
            .ok_or_else(|| EngineError::corrupt("key length overflow"))?;
    }
    Err(EngineError::corrupt("unterminated keyword"))
}

fn read_records(
    source: &impl ReadAt,
    mut offset: u64,
    blocks: &[RecordBlock],
    keys: &[KeyEntry],
    kind: MdictKind,
    encoding: TextEncoding,
) -> Result<Vec<DictionaryEntry>> {
    let mut entries = Vec::with_capacity(keys.len());
    let mut key_index = 0_usize;
    let mut unpacked_offset = 0_u64;
    let mut pending = Vec::new();
    for block_info in blocks {
        let packed_size = limited_usize(block_info.packed, MAX_BLOCK_BYTES, "record block")?;
        let unpacked_size = limited_usize(block_info.unpacked, MAX_BLOCK_BYTES, "record block")?;
        let packed = source.read_exact_at(offset, packed_size)?;
        offset += block_info.packed;
        let block = decode_block(&packed, unpacked_size)?;
        let block_end = unpacked_offset
            .checked_add(block_info.unpacked)
            .ok_or_else(|| EngineError::corrupt("record offset overflow"))?;
        while let Some(key) = keys.get(key_index) {
            if key.start >= block_end {
                break;
            }
            if key.end > key.start + MAX_ENTRY_BYTES as u64 {
                return Err(EngineError::limit("dictionary entry is too large"));
            }
            let part_start = key.start.max(unpacked_offset) - unpacked_offset;
            let part_end = key.end.min(block_end) - unpacked_offset;
            if part_end < part_start || part_end > block.len() as u64 {
                return Err(EngineError::corrupt("record offset outside block"));
            }
            pending.extend_from_slice(&block[part_start as usize..part_end as usize]);
            if pending.len() > MAX_ENTRY_BYTES {
                return Err(EngineError::limit("dictionary entry is too large"));
            }
            if key.end <= block_end {
                let data = std::mem::take(&mut pending);
                let data = if kind == MdictKind::Definitions {
                    decode_text(&data, encoding)?.into_bytes()
                } else {
                    data
                };
                entries.push(DictionaryEntry {
                    data,
                    key: key.key.clone(),
                });
                key_index += 1;
            } else {
                break;
            }
        }
        unpacked_offset = block_end;
    }
    if key_index != keys.len() || !pending.is_empty() {
        return Err(EngineError::corrupt("incomplete record data"));
    }
    Ok(entries)
}

fn decode_block(bytes: &[u8], expected_size: usize) -> Result<Vec<u8>> {
    if bytes.len() < 8 {
        return Err(EngineError::corrupt("truncated compressed block"));
    }
    let codec = u32::from_le_bytes(bytes[..4].try_into().expect("fixed length"));
    let checksum = u32::from_be_bytes(bytes[4..8].try_into().expect("fixed length"));
    let payload = &bytes[8..];
    let output = match codec {
        0 => payload.to_vec(),
        1 => {
            let mut output = vec![0_u8; expected_size];
            let written = lzokay::decompress::decompress(payload, &mut output)
                .map_err(|_| EngineError::corrupt("invalid LZO block"))?;
            output.truncate(written);
            output
        }
        2 => miniz_oxide::inflate::decompress_to_vec_zlib_with_limit(payload, expected_size)
            .map_err(|_| EngineError::corrupt("invalid zlib block"))?,
        _ => return Err(EngineError::unsupported("unsupported MDict compression")),
    };
    if output.len() != expected_size || adler32(&output) != checksum {
        return Err(EngineError::corrupt("compressed block checksum mismatch"));
    }
    Ok(output)
}

fn decrypt_keyword_index(bytes: &mut [u8]) -> Result<()> {
    if bytes.len() < 8 {
        return Err(EngineError::corrupt("truncated encrypted index"));
    }
    let mut seed = Vec::with_capacity(8);
    seed.extend_from_slice(&bytes[4..8]);
    seed.extend_from_slice(&[0x95, 0x36, 0, 0]);
    let key = Ripemd128::digest(seed);
    let mut previous = 0x36_u8;
    for (index, value) in bytes[8..].iter_mut().enumerate() {
        let encrypted = *value;
        let rotated = encrypted.rotate_left(4);
        *value = rotated ^ previous ^ (index as u8) ^ key[index % key.len()];
        previous = encrypted;
    }
    Ok(())
}

fn decode_text(bytes: &[u8], encoding: TextEncoding) -> Result<String> {
    let value = match encoding {
        TextEncoding::Utf16Le => {
            if !bytes.len().is_multiple_of(2) {
                return Err(EngineError::corrupt("invalid UTF-16LE text"));
            }
            let units = bytes
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect::<Vec<_>>();
            String::from_utf16(&units).map_err(|_| EngineError::corrupt("invalid UTF-16LE text"))?
        }
        TextEncoding::Utf8 => decode_with(UTF_8, bytes)?,
        TextEncoding::Gb18030 => decode_with(GBK, bytes)?,
        TextEncoding::Big5 => decode_with(BIG5, bytes)?,
    };
    Ok(value.trim_matches('\0').to_owned())
}

fn decode_with(encoding: &'static encoding_rs::Encoding, bytes: &[u8]) -> Result<String> {
    let (value, _, malformed) = encoding.decode(bytes);
    if malformed {
        return Err(EngineError::corrupt("invalid encoded text"));
    }
    Ok(value.into_owned())
}

fn encoded_byte_length(encoding: TextEncoding, units: usize) -> Result<usize> {
    units
        .checked_mul(null_width(encoding))
        .ok_or_else(|| EngineError::corrupt("text length overflow"))
}

const fn null_width(encoding: TextEncoding) -> usize {
    match encoding {
        TextEncoding::Utf16Le => 2,
        _ => 1,
    }
}

fn limited_usize(value: u64, limit: usize, label: &'static str) -> Result<usize> {
    let value = usize::try_from(value).map_err(|_| EngineError::limit(label))?;
    if value > limit {
        return Err(EngineError::limit(label));
    }
    Ok(value)
}

fn adler32(bytes: &[u8]) -> u32 {
    const MOD: u32 = 65_521;
    let mut a = 1_u32;
    let mut b = 0_u32;
    for chunk in bytes.chunks(5_552) {
        for value in chunk {
            a += u32::from(*value);
            b += a;
        }
        a %= MOD;
        b %= MOD;
    }
    (b << 16) | a
}

#[cfg(test)]
mod tests {
    use base64::{engine::general_purpose::STANDARD, Engine};

    use super::*;
    use crate::SliceSource;

    const INDEPENDENT_MDX: &str = "AAAArDwARABpAGMAdAAgAEcAZQBuAGUAcgBhAHQAZQBkAEIAeQBFAG4AZwBpAG4AZQBWAGUAcgBzAGkAbwBuAD0AIgAyAC4AMAAiACAARQBuAGMAbwBkAGkAbgBnAD0AIgBVAFQARgAtADgAIgAgAEYAbwByAG0AYQB0AD0AIgBIAHQAbQBsACIAIABUAGkAdABsAGUAPQAiAFQAZQBzAHQAIABEAGkAYwB0ACIAPgDmqxxYAAAAAAAAAAEAAAAAAAAAAwAAAAAAAAAlAAAAAAAAACYAAAAAAAAAJgSFAHYCAAAARaADXHicY2AAA2YG5rT8fAYGlpLU4hIGKFCD0uoARaADXAIAAABQWgU3eJxjYICAtPx8KIuBJSM1JwfOkypJLS5hAABQWgU3AAAAAAAAAAEAAAAAAAAAAwAAAAAAAAAQAAAAAAAAADwAAAAAAAAAPAAAAAAAAAApAgAAACLTDeR4nAEpANb/YmFyADxiPmhlbGxvPC9iPiBncmVldGluZwB0ZXN0IGRhdGEgaGVyZQAi0w3k";

    fn uncompressed_block(data: &[u8]) -> Vec<u8> {
        let mut output = 0_u32.to_le_bytes().to_vec();
        output.extend_from_slice(&adler32(data).to_be_bytes());
        output.extend_from_slice(data);
        output
    }

    fn version_1_fixture(encrypted: Option<&str>) -> Vec<u8> {
        let encrypted = encrypted.map_or(String::new(), |value| format!(r#" Encrypted="{value}""#));
        let header =
            format!(r#"<Dictionary GeneratedByEngineVersion="1.2" Encoding="UTF-8"{encrypted}>"#)
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect::<Vec<_>>();
        let mut output = (header.len() as u32).to_be_bytes().to_vec();
        output.extend_from_slice(&header);
        output.extend_from_slice(&adler32(&header).to_le_bytes());

        let mut key_data = 0_u32.to_be_bytes().to_vec();
        key_data.extend_from_slice(b"foo\0");
        let key_block = uncompressed_block(&key_data);
        let mut key_index = 1_u32.to_be_bytes().to_vec();
        key_index.push(3);
        key_index.extend_from_slice(b"foo\0");
        key_index.push(3);
        key_index.extend_from_slice(b"foo\0");
        key_index.extend_from_slice(&(key_block.len() as u32).to_be_bytes());
        key_index.extend_from_slice(&(key_data.len() as u32).to_be_bytes());
        for value in [1_u32, 1, key_index.len() as u32, key_block.len() as u32] {
            output.extend_from_slice(&value.to_be_bytes());
        }
        output.extend_from_slice(&key_index);
        output.extend_from_slice(&key_block);

        let record_data = b"bar";
        let record_block = uncompressed_block(record_data);
        for value in [1_u32, 1, 8, record_block.len() as u32] {
            output.extend_from_slice(&value.to_be_bytes());
        }
        output.extend_from_slice(&(record_block.len() as u32).to_be_bytes());
        output.extend_from_slice(&(record_data.len() as u32).to_be_bytes());
        output.extend_from_slice(&record_block);
        output
    }

    #[test]
    fn parses_independently_generated_v2_fixture() {
        let bytes = STANDARD.decode(INDEPENDENT_MDX).expect("fixture base64");
        let archive = MdictArchive::read(&SliceSource(&bytes), MdictKind::Definitions)
            .expect("valid independent fixture");
        assert_eq!(archive.entries.len(), 3);
        assert_eq!(archive.entries[0].key, "foo");
        assert_eq!(archive.entries[0].data, b"bar");
        assert_eq!(archive.entries[1].key, "hello");
        assert_eq!(archive.entries[1].data, b"<b>hello</b> greeting");
        assert_eq!(archive.entries[2].key, "test");
        assert_eq!(archive.entries[2].data, b"test data here");
    }

    #[test]
    fn parses_version_1_2_layout() {
        let bytes = version_1_fixture(None);
        let archive = MdictArchive::read(&SliceSource(&bytes), MdictKind::Definitions)
            .expect("valid version 1.2 fixture");
        assert_eq!(archive.entries[0].key, "foo");
        assert_eq!(archive.entries[0].data, b"bar");
    }

    #[test]
    fn treats_textual_no_encryption_header_as_unencrypted() {
        let bytes = version_1_fixture(Some("No"));
        let archive = MdictArchive::read(&SliceSource(&bytes), MdictKind::Definitions)
            .expect("textual No means the dictionary is not encrypted");
        assert_eq!(archive.entries[0].key, "foo");
        assert_eq!(archive.entries[0].data, b"bar");
    }

    #[test]
    fn still_rejects_textual_encryption_headers() {
        for value in ["Yes", "unknown"] {
            let bytes = version_1_fixture(Some(value));
            let error = MdictArchive::read(&SliceSource(&bytes), MdictKind::Definitions)
                .expect_err("textual encryption marker must remain protected");
            assert_eq!(error.detail, "registered or device-bound dictionary");
        }
    }

    #[test]
    fn rejects_truncated_inputs_without_panicking() {
        let bytes = STANDARD.decode(INDEPENDENT_MDX).expect("fixture base64");
        for length in 0..bytes.len() {
            let result = MdictArchive::read(&SliceSource(&bytes[..length]), MdictKind::Definitions);
            assert!(result.is_err());
        }
    }

    #[test]
    fn checked_range_rejects_overflow() {
        assert!(checked_range(u64::MAX, u64::MAX, 1).is_err());
    }

    #[test]
    fn decodes_uncompressed_zlib_and_lzo_blocks() {
        let value = b"bounded dictionary block";
        for (codec, payload) in [
            (0_u32, value.to_vec()),
            (
                1_u32,
                lzokay::compress::compress(value).expect("compress LZO fixture"),
            ),
            (2_u32, miniz_oxide::deflate::compress_to_vec_zlib(value, 3)),
        ] {
            let mut block = Vec::new();
            block.extend_from_slice(&codec.to_le_bytes());
            block.extend_from_slice(&adler32(value).to_be_bytes());
            block.extend_from_slice(&payload);
            assert_eq!(
                decode_block(&block, value.len()).expect("decode block"),
                value
            );
        }
    }

    #[test]
    fn decodes_all_supported_text_encodings() {
        let utf16 = "dictionary"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>();
        assert_eq!(
            decode_text(&utf16, TextEncoding::Utf16Le).unwrap(),
            "dictionary"
        );
        let (gb, _, gb_error) = GBK.encode("词典");
        assert!(!gb_error);
        assert_eq!(decode_text(&gb, TextEncoding::Gb18030).unwrap(), "词典");
        let (big5, _, big5_error) = BIG5.encode("詞典");
        assert!(!big5_error);
        assert_eq!(decode_text(&big5, TextEncoding::Big5).unwrap(), "詞典");
    }

    #[test]
    fn decrypts_keyword_index_encryption() {
        let checksum = [1_u8, 2, 3, 4];
        let mut seed = checksum.to_vec();
        seed.extend_from_slice(&[0x95, 0x36, 0, 0]);
        let key = Ripemd128::digest(seed);
        let plain = b"encrypted keyword index";
        let mut encrypted = vec![2, 0, 0, 0];
        encrypted.extend_from_slice(&checksum);
        let mut previous = 0x36_u8;
        for (index, value) in plain.iter().enumerate() {
            let byte = (value ^ previous ^ index as u8 ^ key[index % key.len()]).rotate_right(4);
            encrypted.push(byte);
            previous = byte;
        }
        decrypt_keyword_index(&mut encrypted).expect("decrypt index");
        assert_eq!(&encrypted[8..], plain);
    }
}
