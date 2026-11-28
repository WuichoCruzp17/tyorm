use serde::{Deserialize, Serialize};

use super::anomaly::AnomalySeverity;
use super::chunk::CsvChunk;

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvSessionStatistics {
    pub records_read: u64,
    pub records_delivered: u64,

    pub valid_records: u64,
    pub invalid_records: u64,

    pub records_with_warnings: u64,

    pub warning_count: u64,
    pub error_count: u64,
    pub fatal_count: u64,

    pub chunks_delivered: u64,
    pub payload_bytes_delivered: u64,
}

impl CsvSessionStatistics {
    pub(crate) fn register_chunk(&mut self, chunk: &CsvChunk) {
        self.chunks_delivered += 1;

        self.payload_bytes_delivered += chunk.payload_bytes;

        self.records_delivered += chunk.records.len() as u64;

        for record in &chunk.records {
            if record.is_valid() {
                self.valid_records += 1;
            } else {
                self.invalid_records += 1;
            }

            let mut has_warning = false;

            for anomaly in &record.anomalies {
                match anomaly.severity {
                    AnomalySeverity::Warning => {
                        self.warning_count += 1;
                        has_warning = true;
                    }

                    AnomalySeverity::Error => {
                        self.error_count += 1;
                    }

                    AnomalySeverity::Fatal => {
                        self.fatal_count += 1;
                    }
                }
            }

            if has_warning {
                self.records_with_warnings += 1;
            }
        }
    }

    pub fn undelivered_records(&self) -> u64 {
        self.records_read.saturating_sub(self.records_delivered)
    }
}
