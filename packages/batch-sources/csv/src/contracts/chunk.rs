use serde::{Deserialize, Serialize};

use super::record::RawBatchRecord;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvChunk {
    pub chunk_number: u64,
    pub records: Vec<RawBatchRecord>,
    pub payload_bytes: u64,
}

impl CsvChunk {
    pub fn len(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }

    pub fn valid_count(&self) -> usize {
        self.records
            .iter()
            .filter(|record| record.is_valid())
            .count()
    }

    pub fn invalid_count(&self) -> usize {
        self.len() - self.valid_count()
    }
}
