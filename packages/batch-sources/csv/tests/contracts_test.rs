use tyorm_batch_csv::*;

fn create_record() -> RawBatchRecord {
    RawBatchRecord {
        position: CsvPosition {
            record_number: 1,
            line_start: 2,
            line_end: 2,
            byte_offset: 20,
        },
        values: vec!["1".to_string(), "Customer".to_string()],
        anomalies: vec![],
    }
}

#[test]
fn should_create_default_options() {
    let options = CsvReaderOptions::default();

    assert_eq!(options.delimiter, b',');
    assert_eq!(options.chunk_size, 1_000);
    assert!(options.has_headers);
    assert_eq!(options.encoding, CsvEncoding::Utf8);
}

#[test]
fn should_accept_record_without_anomalies() {
    let record = create_record();

    assert!(record.is_valid());
    assert!(!record.has_anomalies());
    assert!(!record.has_errors());
}

#[test]
fn should_accept_record_with_warning() {
    let mut record = create_record();

    record.anomalies.push(CsvAnomaly {
        code: CsvAnomalyCode::SuspiciousCharacter,
        severity: AnomalySeverity::Warning,
        column_index: Some(1),
        message: "Suspicious character".to_string(),
    });

    assert!(record.is_valid());
    assert!(record.has_anomalies());
    assert!(!record.has_errors());
}

#[test]
fn should_reject_record_with_error() {
    let mut record = create_record();

    record.anomalies.push(CsvAnomaly {
        code: CsvAnomalyCode::InvalidColumnCount,
        severity: AnomalySeverity::Error,
        column_index: None,
        message: "Invalid column count".to_string(),
    });

    assert!(!record.is_valid());
    assert!(record.has_errors());
}

#[test]
fn should_reject_record_with_fatal_anomaly() {
    let mut record = create_record();

    record.anomalies.push(CsvAnomaly {
        code: CsvAnomalyCode::UnclosedQuote,
        severity: AnomalySeverity::Fatal,
        column_index: None,
        message: "Unclosed quote".to_string(),
    });

    assert!(!record.is_valid());
    assert!(record.has_errors());
}

#[test]
fn should_count_chunk_records() {
    let valid = create_record();
    let mut invalid = create_record();

    invalid.anomalies.push(CsvAnomaly {
        code: CsvAnomalyCode::InvalidColumnCount,
        severity: AnomalySeverity::Error,
        column_index: None,
        message: "Invalid record".to_string(),
    });

    let chunk = CsvChunk {
        chunk_number: 1,
        records: vec![valid, invalid],
        payload_bytes: 18,
    };

    assert_eq!(chunk.len(), 2);
    assert_eq!(chunk.valid_count(), 1);
    assert_eq!(chunk.invalid_count(), 1);
    assert!(!chunk.is_empty());
}

#[test]
fn should_handle_empty_chunk() {
    let chunk = CsvChunk {
        chunk_number: 1,
        records: vec![],
        payload_bytes: 0,
    };

    assert!(chunk.is_empty());
    assert_eq!(chunk.valid_count(), 0);
    assert_eq!(chunk.invalid_count(), 0);
}
