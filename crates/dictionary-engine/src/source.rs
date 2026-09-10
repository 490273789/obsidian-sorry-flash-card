use crate::error::{EngineError, Result};

pub trait ReadAt {
    fn len(&self) -> u64;
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
    fn read_exact_at(&self, offset: u64, length: usize) -> Result<Vec<u8>>;
}

pub struct SliceSource<'a>(pub &'a [u8]);

impl ReadAt for SliceSource<'_> {
    fn len(&self) -> u64 {
        self.0.len() as u64
    }

    fn read_exact_at(&self, offset: u64, length: usize) -> Result<Vec<u8>> {
        let start = usize::try_from(offset).map_err(|_| EngineError::corrupt("offset overflow"))?;
        let end = start
            .checked_add(length)
            .ok_or_else(|| EngineError::corrupt("range overflow"))?;
        let value = self
            .0
            .get(start..end)
            .ok_or_else(|| EngineError::corrupt("truncated input"))?;
        Ok(value.to_vec())
    }
}

pub fn checked_range(total: u64, offset: u64, length: u64) -> Result<()> {
    let end = offset
        .checked_add(length)
        .ok_or_else(|| EngineError::corrupt("range overflow"))?;
    if end > total {
        return Err(EngineError::corrupt("truncated input"));
    }
    Ok(())
}
