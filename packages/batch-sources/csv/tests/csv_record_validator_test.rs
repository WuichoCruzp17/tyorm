use tyorm_batch_csv::*;

//Funciones auxiliares

fn validate(values: &[&str], expected_columns: Option<usize>) -> Vec<CsvAnomaly> {
    let values: Vec<String> = values.iter().map(|value| value.to_string()).collect();

    CsvRecordValidator::validate(&values, expected_columns, &CsvReaderOptions::default())
}

fn contains_code(anomalies: &[CsvAnomaly], code: CsvAnomalyCode) -> bool {
    anomalies.iter().any(|anomaly| anomaly.code == code)
}

//Validacion estructural

#[test]
fn should_accept_valid_record() {
    let anomalies = validate(&["1", "Luis", "ACTIVE"], Some(3));

    assert!(anomalies.is_empty());
}

#[test]
fn should_detect_missing_columns() {
    let anomalies = validate(&["1", "Luis"], Some(3));

    assert!(contains_code(
        &anomalies,
        CsvAnomalyCode::InvalidColumnCount,
    ));

    assert!(contains_code(&anomalies, CsvAnomalyCode::MissingColumn,));
}

#[test]
fn should_detect_unexpected_columns() {
    let anomalies = validate(&["1", "Luis", "extra"], Some(2));

    assert!(contains_code(
        &anomalies,
        CsvAnomalyCode::InvalidColumnCount,
    ));

    assert!(contains_code(&anomalies, CsvAnomalyCode::UnexpectedColumn,));
}

#[test]
fn should_report_first_missing_column_index() {
    let anomalies = validate(&["1", "Luis"], Some(4));

    let anomaly = anomalies
        .iter()
        .find(|anomaly| anomaly.code == CsvAnomalyCode::MissingColumn)
        .unwrap();

    assert_eq!(anomaly.column_index, Some(2));
}

#[test]
fn should_report_first_unexpected_column_index() {
    let anomalies = validate(&["1", "Luis", "extra"], Some(2));

    let anomaly = anomalies
        .iter()
        .find(|anomaly| anomaly.code == CsvAnomalyCode::UnexpectedColumn)
        .unwrap();

    assert_eq!(anomaly.column_index, Some(2));
}

#[test]
fn should_accept_unknown_expected_column_count() {
    let anomalies = validate(&["1", "Luis"], None);

    assert!(anomalies.is_empty());
}

#[test]
fn should_accept_empty_field_values() {
    let anomalies = validate(&["1", "", ""], Some(3));

    assert!(anomalies.is_empty());
}

//Validacion de caracteres
#[test]
fn should_detect_null_character() {
    let anomalies = validate(&["1", "Lu\0is"], Some(2));

    assert!(contains_code(&anomalies, CsvAnomalyCode::NullByte,));
}

#[test]
fn should_detect_control_character() {
    let anomalies = validate(&["1", "Luis\u{001B}"], Some(2));

    assert!(contains_code(&anomalies, CsvAnomalyCode::ControlCharacter,));
}

#[test]
fn should_allow_tabs() {
    let anomalies = validate(&["1", "Luis\tSegura"], Some(2));

    assert!(anomalies.is_empty());
}

#[test]
fn should_allow_multiline_fields() {
    let anomalies = validate(&["1", "First\r\nSecond\nThird"], Some(2));

    assert!(anomalies.is_empty());
}

#[test]
fn should_detect_zero_width_space() {
    let anomalies = validate(&["1", "Luis\u{200B}"], Some(2));

    let anomaly = anomalies
        .iter()
        .find(|anomaly| anomaly.code == CsvAnomalyCode::SuspiciousCharacter)
        .unwrap();

    assert_eq!(anomaly.severity, AnomalySeverity::Warning);

    assert_eq!(anomaly.column_index, Some(1));
}

#[test]
fn should_detect_embedded_bom() {
    let anomalies = validate(&["1", "Luis\u{FEFF}"], Some(2));

    assert!(contains_code(
        &anomalies,
        CsvAnomalyCode::SuspiciousCharacter,
    ));
}

#[test]
fn should_warn_about_replacement_character() {
    let anomalies = validate(&["1", "\u{FFFD}"], Some(2));

    assert_eq!(anomalies.len(), 1);

    assert_eq!(anomalies[0].severity, AnomalySeverity::Warning);
}

#[test]
fn should_accept_regular_unicode_characters() {
    let anomalies = validate(&["José", "東京", "😀"], Some(3));

    assert!(anomalies.is_empty());
}

#[test]
fn should_aggregate_repeated_character_anomalies() {
    let anomalies = validate(&["\0\0\0\0"], Some(1));

    assert_eq!(anomalies.len(), 1);

    assert_eq!(anomalies[0].code, CsvAnomalyCode::NullByte);
}

#[test]
fn should_not_duplicate_null_as_control_character() {
    let anomalies = validate(&["\0"], Some(1));

    assert!(!contains_code(&anomalies, CsvAnomalyCode::ControlCharacter,));
}

//Validacion de recursos

#[test]
fn should_detect_too_many_columns() {
    let options = CsvReaderOptions {
        max_columns: 2,
        ..Default::default()
    };

    let values = vec!["1".to_string(), "Luis".to_string(), "extra".to_string()];

    let anomalies = CsvRecordValidator::validate(&values, None, &options);

    assert!(contains_code(&anomalies, CsvAnomalyCode::TooManyColumns,));
}

#[test]
fn should_detect_oversized_field() {
    let options = CsvReaderOptions {
        max_field_bytes: 4,
        ..Default::default()
    };

    let values = vec!["Customer".to_string()];

    let anomalies = CsvRecordValidator::validate(&values, Some(1), &options);

    assert!(contains_code(&anomalies, CsvAnomalyCode::FieldTooLarge,));
}

#[test]
fn should_detect_oversized_record() {
    let options = CsvReaderOptions {
        max_field_bytes: 4,
        max_record_bytes: 6,
        ..Default::default()
    };

    let values = vec!["name".to_string(), "code".to_string()];

    let anomalies = CsvRecordValidator::validate(&values, Some(2), &options);

    assert!(contains_code(&anomalies, CsvAnomalyCode::RecordTooLarge,));
}

#[test]
fn should_measure_field_size_in_utf8_bytes() {
    let options = CsvReaderOptions {
        max_field_bytes: 3,
        ..Default::default()
    };

    let values = vec!["😀".to_string()];

    let anomalies = CsvRecordValidator::validate(&values, Some(1), &options);

    assert!(contains_code(&anomalies, CsvAnomalyCode::FieldTooLarge,));
}

#[test]
fn should_accept_exact_resource_limits() {
    let options = CsvReaderOptions {
        max_columns: 2,
        max_field_bytes: 4,
        max_record_bytes: 8,
        ..Default::default()
    };

    let values = vec!["name".to_string(), "code".to_string()];

    let anomalies = CsvRecordValidator::validate(&values, Some(2), &options);

    assert!(anomalies.is_empty());
}
