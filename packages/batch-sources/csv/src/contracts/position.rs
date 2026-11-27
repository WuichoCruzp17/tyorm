use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvPosition {
    pub record_number: u64,
    pub line_start: u64,
    pub line_end: u64,
    pub byte_offset: u64,
}
