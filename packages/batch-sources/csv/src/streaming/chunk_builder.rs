use crate::contracts::{CsvChunk, CsvReaderOptions, RawBatchRecord};

use crate::errors::{CsvError, CsvResult};

pub struct CsvChunkBuilder {
    chunk_number: u64,

    records: Vec<RawBatchRecord>,
    payload_bytes: u64,

    max_records: usize,
    max_bytes: u64,
}

impl CsvChunkBuilder {
    pub fn new(chunk_number: u64, options: &CsvReaderOptions) -> CsvResult<Self> {
        options.validate()?;

        Ok(Self {
            chunk_number,

            records: Vec::with_capacity(options.chunk_size.min(1024)),

            payload_bytes: 0,

            max_records: options.chunk_size,
            max_bytes: options.max_chunk_bytes as u64,
        })
    }

    pub fn record_payload_bytes(record: &RawBatchRecord) -> u64 {
        record.values.iter().fold(0u64, |total, value| {
            total.saturating_add(value.len() as u64)
        })
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }

    pub fn payload_bytes(&self) -> u64 {
        self.payload_bytes
    }

    pub fn is_full(&self) -> bool {
        self.records.len() >= self.max_records || self.payload_bytes >= self.max_bytes
    }

    pub fn can_accept(&self, record: &RawBatchRecord) -> bool {
        if self.is_full() {
            return false;
        }

        let record_bytes = Self::record_payload_bytes(record);

        record_bytes <= self.max_bytes - self.payload_bytes
    }

    pub fn try_push(&mut self, record: RawBatchRecord) -> Result<(), RawBatchRecord> {
        if !self.can_accept(&record) {
            return Err(record);
        }

        self.payload_bytes += Self::record_payload_bytes(&record);

        self.records.push(record);

        Ok(())
    }

    pub fn finish(self) -> CsvChunk {
        CsvChunk {
            chunk_number: self.chunk_number,
            records: self.records,
            payload_bytes: self.payload_bytes,
        }
    }

    pub(crate) fn oversized_record_error(
        record: &RawBatchRecord,
        options: &CsvReaderOptions,
    ) -> CsvError {
        let actual = Self::record_payload_bytes(record);

        CsvError::ResourceLimitExceeded {
            resource: "chunk_record_bytes",
            limit: options.max_chunk_bytes,
            actual: usize::try_from(actual).unwrap_or(usize::MAX),
        }
    }
}
