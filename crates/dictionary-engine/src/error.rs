use std::fmt::{Display, Formatter};

use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorCode {
    UnsupportedFormat,
    Encrypted,
    Corrupt,
    LimitExceeded,
    Cancelled,
    StorageFailed,
}

#[derive(Debug)]
pub struct EngineError {
    pub code: ErrorCode,
    pub detail: &'static str,
}

impl EngineError {
    pub const fn corrupt(detail: &'static str) -> Self {
        Self {
            code: ErrorCode::Corrupt,
            detail,
        }
    }

    pub const fn encrypted(detail: &'static str) -> Self {
        Self {
            code: ErrorCode::Encrypted,
            detail,
        }
    }

    pub const fn limit(detail: &'static str) -> Self {
        Self {
            code: ErrorCode::LimitExceeded,
            detail,
        }
    }

    pub const fn unsupported(detail: &'static str) -> Self {
        Self {
            code: ErrorCode::UnsupportedFormat,
            detail,
        }
    }
}

impl Display for EngineError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.detail)
    }
}

impl std::error::Error for EngineError {}

pub type Result<T> = std::result::Result<T, EngineError>;
