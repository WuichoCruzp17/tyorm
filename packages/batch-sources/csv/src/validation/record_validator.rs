use crate::contracts::{AnomalySeverity, CsvAnomaly, CsvAnomalyCode, CsvReaderOptions};

pub struct CsvRecordValidator;

impl CsvRecordValidator {
    pub fn validate(
        values: &[String],
        expected_columns: Option<usize>,
        options: &CsvReaderOptions,
    ) -> Vec<CsvAnomaly> {
        let mut anomalies = Vec::new();

        Self::validate_column_count(values, expected_columns, options, &mut anomalies);

        Self::validate_record_size(values, options, &mut anomalies);

        for (index, value) in values.iter().enumerate() {
            Self::validate_field_size(index, value, options, &mut anomalies);

            Self::validate_characters(index, value, &mut anomalies);
        }

        anomalies
    }

    fn validate_column_count(
        values: &[String],
        expected_columns: Option<usize>,
        options: &CsvReaderOptions,
        anomalies: &mut Vec<CsvAnomaly>,
    ) {
        let actual = values.len();

        if actual > options.max_columns {
            anomalies.push(CsvAnomaly {
                code: CsvAnomalyCode::TooManyColumns,
                severity: AnomalySeverity::Error,
                column_index: None,
                message: format!(
                    "Column limit exceeded: limit={}, actual={actual}",
                    options.max_columns
                ),
            });
        }

        let Some(expected) = expected_columns else {
            return;
        };

        if actual == expected {
            return;
        }

        anomalies.push(CsvAnomaly {
            code: CsvAnomalyCode::InvalidColumnCount,
            severity: AnomalySeverity::Error,
            column_index: None,
            message: format!("Invalid column count: expected={expected}, actual={actual}"),
        });

        if actual < expected {
            anomalies.push(CsvAnomaly {
                code: CsvAnomalyCode::MissingColumn,
                severity: AnomalySeverity::Error,
                column_index: Some(actual),
                message: format!("{} column(s) missing", expected - actual),
            });
        } else {
            anomalies.push(CsvAnomaly {
                code: CsvAnomalyCode::UnexpectedColumn,
                severity: AnomalySeverity::Error,
                column_index: Some(expected),
                message: format!("{} unexpected column(s)", actual - expected),
            });
        }
    }

    fn validate_record_size(
        values: &[String],
        options: &CsvReaderOptions,
        anomalies: &mut Vec<CsvAnomaly>,
    ) {
        let total_bytes = values
            .iter()
            .fold(0usize, |total, value| total.saturating_add(value.len()));

        if total_bytes > options.max_record_bytes {
            anomalies.push(CsvAnomaly {
                code: CsvAnomalyCode::RecordTooLarge,
                severity: AnomalySeverity::Error,
                column_index: None,
                message: format!(
                    "Record size exceeded: limit={}, actual={total_bytes}",
                    options.max_record_bytes
                ),
            });
        }
    }

    fn validate_field_size(
        index: usize,
        value: &str,
        options: &CsvReaderOptions,
        anomalies: &mut Vec<CsvAnomaly>,
    ) {
        let actual = value.len();

        if actual > options.max_field_bytes {
            anomalies.push(CsvAnomaly {
                code: CsvAnomalyCode::FieldTooLarge,
                severity: AnomalySeverity::Error,
                column_index: Some(index),
                message: format!(
                    "Field size exceeded: limit={}, actual={actual}",
                    options.max_field_bytes
                ),
            });
        }
    }

    fn validate_characters(index: usize, value: &str, anomalies: &mut Vec<CsvAnomaly>) {
        let mut has_null = false;
        let mut has_control = false;
        let mut has_suspicious = false;

        for character in value.chars() {
            if character == '\0' {
                has_null = true;
                continue;
            }

            if Self::is_disallowed_control(character) {
                has_control = true;
            }

            if Self::is_suspicious(character) {
                has_suspicious = true;
            }
        }

        if has_null {
            anomalies.push(CsvAnomaly {
                code: CsvAnomalyCode::NullByte,
                severity: AnomalySeverity::Error,
                column_index: Some(index),
                message: "Field contains a NUL character".to_string(),
            });
        }

        if has_control {
            anomalies.push(CsvAnomaly {
                code: CsvAnomalyCode::ControlCharacter,
                severity: AnomalySeverity::Error,
                column_index: Some(index),
                message: "Field contains disallowed control characters".to_string(),
            });
        }

        if has_suspicious {
            anomalies.push(CsvAnomaly {
                code: CsvAnomalyCode::SuspiciousCharacter,
                severity: AnomalySeverity::Warning,
                column_index: Some(index),
                message: "Field contains potentially suspicious Unicode characters".to_string(),
            });
        }
    }

    fn is_disallowed_control(character: char) -> bool {
        character.is_control() && !matches!(character, '\t' | '\r' | '\n')
    }

    fn is_suspicious(character: char) -> bool {
        matches!(
            character,
            '\u{200B}'
                | '\u{200C}'
                | '\u{200D}'
                | '\u{200E}'
                | '\u{200F}'
                | '\u{202A}'..='\u{202E}'
                | '\u{2060}'
                | '\u{2066}'..='\u{2069}'
                | '\u{FEFF}'
                | '\u{FFFD}'
        )
    }
}
