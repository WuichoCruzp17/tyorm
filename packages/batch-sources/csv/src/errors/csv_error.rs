use thiserror::Error;

use crate::contracts::CsvPosition;

#[derive(Debug, Error)]
pub enum CsvError {
    #[error("Invalid CSV option '{field}': {reason}")]
    InvalidOption { field: &'static str, reason: String },

    #[error("CSV I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("CSV parser error: {0}")]
    Parser(#[from] csv::Error),

    #[error("Unsupported encoding: {encoding}")]
    UnsupportedEncoding { encoding: String },

    #[error("Invalid CSV encoding at byte offset {byte_offset}")]
    InvalidEncoding { byte_offset: u64 },

    #[error("Invalid CSV headers: {reason}")]
    InvalidHeaders { reason: String },

    #[error("CSV resource limit exceeded: {resource}, limit={limit}, actual={actual}")]
    ResourceLimitExceeded {
        resource: &'static str,
        limit: usize,
        actual: usize,
    },

    #[error("CSV record rejected at position {position:?}: {reason}")]
    RecordRejected {
        position: CsvPosition,
        reason: String,
    },

    #[error("CSV session is closed")]
    SessionClosed,

    #[error("CSV processing was cancelled")]
    Cancelled,

    #[error("CSV internal error: {reason}")]
    Internal { reason: String },
}

pub type CsvResult<T> = Result<T, CsvError>;
