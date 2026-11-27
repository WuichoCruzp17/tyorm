use tyorm_batch_csv::*;

fn assert_invalid(options: CsvReaderOptions, expected_field: &str) {
    match options.validate() {
        Err(CsvError::InvalidOption { field, .. }) => {
            assert_eq!(field, expected_field);
        }
        result => {
            panic!("Expected InvalidOption for {expected_field}, got {result:?}");
        }
    }
}

#[test]
fn should_accept_default_options() {
    let options = CsvReaderOptions::default();

    assert!(options.validate().is_ok());
}

#[test]
fn should_accept_semicolon_delimiter() {
    let options = CsvReaderOptions {
        delimiter: b';',
        ..Default::default()
    };

    assert!(options.validate().is_ok());
}

#[test]
fn should_accept_tab_delimiter() {
    let options = CsvReaderOptions {
        delimiter: b'\t',
        ..Default::default()
    };

    assert!(options.validate().is_ok());
}

#[test]
fn should_accept_custom_escape() {
    let options = CsvReaderOptions {
        escape: Some(b'\\'),
        ..Default::default()
    };

    assert!(options.validate().is_ok());
}

#[test]
fn should_reject_null_delimiter() {
    assert_invalid(
        CsvReaderOptions {
            delimiter: b'\0',
            ..Default::default()
        },
        "delimiter",
    );
}

#[test]
fn should_reject_newline_delimiter() {
    assert_invalid(
        CsvReaderOptions {
            delimiter: b'\n',
            ..Default::default()
        },
        "delimiter",
    );
}

#[test]
fn should_reject_non_ascii_delimiter() {
    assert_invalid(
        CsvReaderOptions {
            delimiter: 255,
            ..Default::default()
        },
        "delimiter",
    );
}

#[test]
fn should_reject_equal_delimiter_and_quote() {
    assert_invalid(
        CsvReaderOptions {
            delimiter: b'"',
            ..Default::default()
        },
        "delimiter",
    );
}

#[test]
fn should_reject_equal_escape_and_delimiter() {
    assert_invalid(
        CsvReaderOptions {
            escape: Some(b','),
            ..Default::default()
        },
        "escape",
    );
}

#[test]
fn should_reject_equal_escape_and_quote() {
    assert_invalid(
        CsvReaderOptions {
            escape: Some(b'"'),
            ..Default::default()
        },
        "escape",
    );
}

#[test]
fn should_reject_zero_chunk_size() {
    assert_invalid(
        CsvReaderOptions {
            chunk_size: 0,
            ..Default::default()
        },
        "chunk_size",
    );
}

#[test]
fn should_reject_zero_max_columns() {
    assert_invalid(
        CsvReaderOptions {
            max_columns: 0,
            ..Default::default()
        },
        "max_columns",
    );
}

#[test]
fn should_reject_zero_field_limit() {
    assert_invalid(
        CsvReaderOptions {
            max_field_bytes: 0,
            ..Default::default()
        },
        "max_field_bytes",
    );
}

#[test]
fn should_reject_zero_record_limit() {
    assert_invalid(
        CsvReaderOptions {
            max_record_bytes: 0,
            ..Default::default()
        },
        "max_record_bytes",
    );
}

#[test]
fn should_reject_zero_chunk_limit() {
    assert_invalid(
        CsvReaderOptions {
            max_chunk_bytes: 0,
            ..Default::default()
        },
        "max_chunk_bytes",
    );
}

#[test]
fn should_reject_field_limit_greater_than_record() {
    assert_invalid(
        CsvReaderOptions {
            max_field_bytes: 1024,
            max_record_bytes: 512,
            ..Default::default()
        },
        "max_field_bytes",
    );
}

#[test]
fn should_reject_record_limit_greater_than_chunk() {
    assert_invalid(
        CsvReaderOptions {
            max_field_bytes: 128,
            max_record_bytes: 1024,
            max_chunk_bytes: 512,
            ..Default::default()
        },
        "max_record_bytes",
    );
}

#[test]
fn should_accept_equal_byte_limits() {
    let options = CsvReaderOptions {
        max_field_bytes: 1024,
        max_record_bytes: 1024,
        max_chunk_bytes: 1024,
        ..Default::default()
    };

    assert!(options.validate().is_ok());
}
