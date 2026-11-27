use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnomalySeverity {
    Warning,
    Error,
    Fatal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CsvAnomalyCode {
    InvalidEncoding,
    InvalidColumnCount,
    MissingColumn,
    UnexpectedColumn,
    DuplicateHeader,
    EmptyHeader,
    MalformedRecord,
    UnclosedQuote,
    ControlCharacter,
    NullByte,
    SuspiciousCharacter,
    FieldTooLarge,
    RecordTooLarge,
    TooManyColumns,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CsvAnomaly {
    pub code: CsvAnomalyCode,
    pub severity: AnomalySeverity,
    pub column_index: Option<usize>,
    pub message: String,
}
