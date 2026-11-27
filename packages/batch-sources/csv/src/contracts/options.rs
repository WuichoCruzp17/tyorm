use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CsvEncoding {
    Utf8,
    Windows1252,
    Utf16Le,
    Utf16Be,
    Auto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CsvTrim {
    None,
    Headers,
    Fields,
    All,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CsvErrorPolicy {
    FailFast,
    ContinueOnError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvReaderOptions {
    pub delimiter: u8,
    pub quote: u8,
    pub escape: Option<u8>,
    pub double_quote: bool,
    pub has_headers: bool,
    pub encoding: CsvEncoding,
    pub trim: CsvTrim,
    pub error_policy: CsvErrorPolicy,
    pub chunk_size: usize,
    pub max_columns: usize,
    pub max_field_bytes: usize,
    pub max_record_bytes: usize,
    pub max_chunk_bytes: usize,
}

impl Default for CsvReaderOptions {
    fn default() -> Self {
        Self {
            delimiter: b',',
            quote: b'"',
            escape: None,
            double_quote: true,
            has_headers: true,
            encoding: CsvEncoding::Utf8,
            trim: CsvTrim::None,
            error_policy: CsvErrorPolicy::ContinueOnError,
            chunk_size: 1_000,
            max_columns: 1_024,
            max_field_bytes: 1024 * 1024,
            max_record_bytes: 8 * 1024 * 1024,
            max_chunk_bytes: 16 * 1024 * 1024,
        }
    }
}

impl CsvReaderOptions {
    pub fn validate(&self) -> crate::errors::CsvResult<()> {
        crate::validation::CsvOptionsValidator::validate(self)
    }
}
