use serde::{Deserialize, Serialize};

use super::anomaly::{AnomalySeverity, CsvAnomaly};
use super::position::CsvPosition;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RawBatchRecord {
    pub position: CsvPosition,
    pub values: Vec<String>,
    pub anomalies: Vec<CsvAnomaly>,
}

impl RawBatchRecord {
    pub fn has_anomalies(&self) -> bool {
        !self.anomalies.is_empty()
    }

    pub fn has_errors(&self) -> bool {
        self.anomalies.iter().any(|anomaly| {
            matches!(
                anomaly.severity,
                AnomalySeverity::Error | AnomalySeverity::Fatal
            )
        })
    }

    pub fn is_valid(&self) -> bool {
        !self.has_errors()
    }
}
