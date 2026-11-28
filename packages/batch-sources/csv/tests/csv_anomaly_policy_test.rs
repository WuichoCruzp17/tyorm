use tyorm_batch_csv::*;

fn create_record(severities: &[AnomalySeverity]) -> RawBatchRecord {
    RawBatchRecord {
        position: CsvPosition {
            record_number: 1,
            line_start: 2,
            line_end: 2,
            byte_offset: 8,
        },
        values: vec!["1".to_string()],
        anomalies: severities
            .iter()
            .map(|severity| CsvAnomaly {
                code: CsvAnomalyCode::MalformedRecord,
                severity: *severity,
                column_index: None,
                message: format!("Test anomaly: {severity:?}"),
            })
            .collect(),
    }
}

#[test]
fn should_accept_valid_record_in_fail_fast() {
    let record = create_record(&[]);

    assert!(CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::FailFast,).is_ok());
}

#[test]
fn should_accept_valid_record_in_continue_mode() {
    let record = create_record(&[]);

    assert!(CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::ContinueOnError,).is_ok());
}

#[test]
fn should_accept_warning_in_fail_fast() {
    let record = create_record(&[AnomalySeverity::Warning]);

    assert!(CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::FailFast,).is_ok());
}

#[test]
fn should_accept_warning_in_continue_mode() {
    let record = create_record(&[AnomalySeverity::Warning]);

    assert!(CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::ContinueOnError,).is_ok());
}

#[test]
fn should_reject_error_in_fail_fast() {
    let record = create_record(&[AnomalySeverity::Error]);

    let result = CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::FailFast);

    assert!(matches!(result, Err(CsvError::RecordRejected { .. })));
}

#[test]
fn should_allow_error_in_continue_mode() {
    let record = create_record(&[AnomalySeverity::Error]);

    assert!(CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::ContinueOnError,).is_ok());
}

#[test]
fn should_reject_fatal_in_fail_fast() {
    let record = create_record(&[AnomalySeverity::Fatal]);

    assert!(CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::FailFast,).is_err());
}

#[test]
fn should_reject_fatal_in_continue_mode() {
    let record = create_record(&[AnomalySeverity::Fatal]);

    assert!(CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::ContinueOnError,).is_err());
}

#[test]
fn should_preserve_rejected_record_position() {
    let record = create_record(&[AnomalySeverity::Error]);

    let result = CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::FailFast);

    match result {
        Err(CsvError::RecordRejected { position, .. }) => {
            assert_eq!(position, record.position);
        }

        other => panic!("Unexpected result: {other:?}"),
    }
}

#[test]
fn should_prioritize_fatal_anomalies() {
    let record = create_record(&[
        AnomalySeverity::Warning,
        AnomalySeverity::Error,
        AnomalySeverity::Fatal,
    ]);

    let result = CsvAnomalyPolicy::evaluate(&record, CsvErrorPolicy::FailFast);

    match result {
        Err(CsvError::RecordRejected { reason, .. }) => {
            assert_eq!(reason, "Test anomaly: Fatal");
        }

        other => panic!("Unexpected result: {other:?}"),
    }
}
