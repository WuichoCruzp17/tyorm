use tyorm_batch_csv::*;

fn options(trim: CsvTrim) -> CsvReaderOptions {
    CsvReaderOptions {
        trim,
        ..Default::default()
    }
}

const DATA: &str = " id , name \n 0001 , Luis \n";

#[test]
fn should_preserve_everything_in_none_mode() {
    let mut reader = CsvReader::new(DATA.as_bytes(), options(CsvTrim::None)).unwrap();

    assert_eq!(reader.headers().unwrap(), &[" id ", " name "]);

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec![" 0001 ", " Luis "]);
}

#[test]
fn should_normalize_only_headers() {
    let mut reader = CsvReader::new(DATA.as_bytes(), options(CsvTrim::Headers)).unwrap();

    assert_eq!(reader.headers().unwrap(), &["id", "name"]);

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec![" 0001 ", " Luis "]);
}

#[test]
fn should_normalize_only_fields() {
    let mut reader = CsvReader::new(DATA.as_bytes(), options(CsvTrim::Fields)).unwrap();

    assert_eq!(reader.headers().unwrap(), &[" id ", " name "]);

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["0001", "Luis"]);
}

#[test]
fn should_normalize_headers_and_fields() {
    let mut reader = CsvReader::new(DATA.as_bytes(), options(CsvTrim::All)).unwrap();

    assert_eq!(reader.headers().unwrap(), &["id", "name"]);

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["0001", "Luis"]);
}

#[test]
fn should_preserve_original_headers() {
    let reader = CsvReader::new(DATA.as_bytes(), options(CsvTrim::All)).unwrap();

    assert_eq!(reader.original_headers().unwrap(), &[" id ", " name "]);

    assert!(reader.headers_were_normalized());
    assert_eq!(reader.normalized_header_count(), 2);
}

#[test]
fn should_not_report_normalization_when_unchanged() {
    let reader = CsvReader::new("id,name\n1,Luis\n".as_bytes(), options(CsvTrim::All)).unwrap();

    assert!(!reader.headers_were_normalized());
    assert_eq!(reader.normalized_header_count(), 0);

    assert_eq!(reader.original_headers(), reader.headers());
}

#[test]
fn should_resolve_normalized_header_index() {
    let reader = CsvReader::new(DATA.as_bytes(), options(CsvTrim::Headers)).unwrap();

    assert_eq!(reader.column_index("id"), Some(0));
    assert_eq!(reader.column_index("name"), Some(1));
    assert_eq!(reader.column_index(" name "), None);
}

#[test]
fn should_reject_duplicates_after_normalization() {
    let result = CsvReader::new("id,name, name \n".as_bytes(), options(CsvTrim::Headers));

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_allow_distinct_headers_without_normalization() {
    let result = CsvReader::new("id,name, name \n".as_bytes(), options(CsvTrim::None));

    assert!(result.is_ok());
}

#[test]
fn should_preserve_original_header_by_index() {
    let reader = CsvReader::new(DATA.as_bytes(), options(CsvTrim::All)).unwrap();

    let headers = reader.header_metadata().unwrap();

    assert_eq!(headers.get_original_name(1), Some(" name "));

    assert_eq!(headers.get_name(1), Some("name"));
}

#[test]
fn should_validate_field_size_before_normalization() {
    let options = CsvReaderOptions {
        trim: CsvTrim::All,
        max_field_bytes: 4,
        ..Default::default()
    };

    let mut reader = CsvReader::new("id,name\n1, Luis \n".as_bytes(), options).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "Luis");
    assert!(!record.is_valid());

    assert!(
        record
            .anomalies
            .iter()
            .any(|anomaly| { anomaly.code == CsvAnomalyCode::FieldTooLarge })
    );
}

#[test]
fn should_validate_header_size_before_normalization() {
    let options = CsvReaderOptions {
        trim: CsvTrim::All,
        max_field_bytes: 4,
        ..Default::default()
    };

    let result = CsvReader::new("id, name \n".as_bytes(), options);

    assert!(matches!(
        result,
        Err(CsvError::ResourceLimitExceeded {
            resource: "header_field_bytes",
            ..
        })
    ));
}

#[test]
fn should_preserve_anomalies_after_normalization() {
    let data = "id,name\n1, Luis\u{200B} \n";

    let mut reader = CsvReader::new(data.as_bytes(), options(CsvTrim::All)).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "Luis\u{200B}");
    assert!(record.is_valid());
    assert!(record.has_anomalies());

    assert!(
        record
            .anomalies
            .iter()
            .any(|anomaly| { anomaly.code == CsvAnomalyCode::SuspiciousCharacter })
    );
}

#[test]
fn should_apply_fail_fast_before_normalization() {
    let options = CsvReaderOptions {
        trim: CsvTrim::All,
        max_field_bytes: 4,
        error_policy: CsvErrorPolicy::FailFast,
        ..Default::default()
    };

    let mut reader = CsvReader::new("id,name\n1, Luis \n".as_bytes(), options).unwrap();

    assert!(matches!(
        reader.next_record(),
        Err(CsvError::RecordRejected { .. })
    ));

    assert!(reader.is_failed());
}

#[test]
fn should_reject_header_control_characters_before_trim() {
    let result = CsvReader::new("id,\tname\n".as_bytes(), options(CsvTrim::All));

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_preserve_original_record_position() {
    let data = concat!(
        "id,description\n",
        "1,\" First\nSecond\n\"\n",
        "2, Normal \n"
    );

    let mut reader = CsvReader::new(data.as_bytes(), options(CsvTrim::All)).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();

    assert_eq!(first.values[1], "First\nSecond");

    assert_eq!(first.position.line_start, 2);
    assert_eq!(first.position.line_end, 4);
    assert_eq!(second.position.line_start, 5);
}

#[test]
fn should_normalize_records_without_headers() {
    let options = CsvReaderOptions {
        has_headers: false,
        trim: CsvTrim::All,
        ..Default::default()
    };

    let mut reader = CsvReader::new(" 1 , Luis \n".as_bytes(), options).unwrap();

    assert!(reader.original_headers().is_none());
    assert!(!reader.headers_were_normalized());
    assert_eq!(reader.normalized_header_count(), 0);

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis"]);
}

#[test]
fn should_normalize_decoded_windows1252_fields() {
    let data = b"id,name\n1, Jos\xE9 \n";

    let options = CsvReaderOptions {
        encoding: CsvEncoding::Windows1252,
        trim: CsvTrim::All,
        ..Default::default()
    };

    let mut reader = CsvReader::new(data.as_slice(), options).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "José");
}
