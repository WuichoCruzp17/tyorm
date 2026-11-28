use crate::contracts::{AnomalySeverity, CsvErrorPolicy, RawBatchRecord};

use crate::errors::{CsvError, CsvResult};

pub struct CsvAnomalyPolicy;

impl CsvAnomalyPolicy {
    pub fn evaluate(record: &RawBatchRecord, policy: CsvErrorPolicy) -> CsvResult<()> {
        let fatal = record
            .anomalies
            .iter()
            .find(|anomaly| anomaly.severity == AnomalySeverity::Fatal);

        if let Some(anomaly) = fatal {
            return Err(CsvError::RecordRejected {
                position: record.position,
                reason: anomaly.message.clone(),
            });
        }

        if policy == CsvErrorPolicy::ContinueOnError {
            return Ok(());
        }

        let error = record
            .anomalies
            .iter()
            .find(|anomaly| anomaly.severity == AnomalySeverity::Error);

        if let Some(anomaly) = error {
            return Err(CsvError::RecordRejected {
                position: record.position,
                reason: anomaly.message.clone(),
            });
        }

        Ok(())
    }
}
