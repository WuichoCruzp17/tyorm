use std::io::Write;

use tempfile::NamedTempFile;
use tyorm_batch_csv::*;

#[test]
fn should_read_headers() {
    let data = "id,name,email\n1,Luis,luis@example.com\n";

    let reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    assert_eq!(reader.headers().unwrap(), &["id", "name", "email"]);

    assert_eq!(reader.records_read(), 0);
}

#[test]
fn should_read_records_sequentially() {
    let data = "id,name\n1,Luis\n2,Ana\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();

    assert_eq!(first.values, vec!["1", "Luis"]);
    assert_eq!(second.values, vec!["2", "Ana"]);

    assert_eq!(first.position.record_number, 1);
    assert_eq!(second.position.record_number, 2);

    assert_eq!(reader.records_read(), 2);
    assert!(reader.next_record().unwrap().is_none());
}

#[test]
fn should_read_without_headers() {
    let data = "1,Luis\n2,Ana\n";

    let options = CsvReaderOptions {
        has_headers: false,
        ..Default::default()
    };

    let mut reader = CsvReader::new(data.as_bytes(), options).unwrap();

    assert!(reader.headers().is_none());

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis"]);
    assert_eq!(record.position.line_start, 1);
}

#[test]
fn should_handle_empty_file() {
    let mut reader = CsvReader::new("".as_bytes(), CsvReaderOptions::default()).unwrap();

    assert!(reader.headers().is_none());
    assert!(reader.next_record().unwrap().is_none());
    assert!(reader.is_finished());
    assert_eq!(reader.records_read(), 0);
}

#[test]
fn should_handle_headers_only() {
    let mut reader = CsvReader::new("id,name\n".as_bytes(), CsvReaderOptions::default()).unwrap();

    assert_eq!(reader.headers().unwrap(), &["id", "name"]);

    assert!(reader.next_record().unwrap().is_none());
    assert!(reader.is_finished());
}

// Formatos CSV y caracteres especiales

#[test]
fn should_read_semicolon_delimiter() {
    let data = "id;name;email\n1;Luis;luis@example.com\n";

    let options = CsvReaderOptions {
        delimiter: b';',
        ..Default::default()
    };

    let mut reader = CsvReader::new(data.as_bytes(), options).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis", "luis@example.com"]);
}

#[test]
fn should_read_quoted_delimiter() {
    let data = "id,name\n1,\"Luis, Segura\"\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis, Segura"]);
}

#[test]
fn should_read_escaped_quotes() {
    let data = "id,description\n1,\"Hello \"\"World\"\"\"\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Hello \"World\""]);
}

#[test]
fn should_preserve_empty_fields() {
    let data = "id,name,email\n1,,\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "", ""]);
}

#[test]
fn should_preserve_original_values() {
    let data = "id,name,amount\n0001, Luis ,12.50\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["0001", " Luis ", "12.50"]);
}

#[test]
fn should_read_utf8_characters() {
    let data = "id,name\n1,José Hernández\n2,東京\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();

    assert_eq!(first.values[1], "José Hernández");
    assert_eq!(second.values[1], "東京");
}

//Posiciones y trazalidad

#[test]
fn should_track_record_positions() {
    let data = "id,name\n1,Luis\n2,Ana\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();

    assert_eq!(first.position.record_number, 1);
    assert_eq!(first.position.line_start, 2);
    assert_eq!(first.position.line_end, 2);
    assert_eq!(first.position.byte_offset, 8);

    assert_eq!(second.position.record_number, 2);
    assert_eq!(second.position.line_start, 3);
    assert_eq!(second.position.line_end, 3);
    assert_eq!(second.position.byte_offset, 15);
}

#[test]
fn should_track_multiline_records() {
    let data = concat!(
        "id,description\n",
        "1,\"First line\nSecond line\"\n",
        "2,Normal record\n"
    );

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();

    assert_eq!(first.values[1], "First line\nSecond line");

    assert_eq!(first.position.line_start, 2);
    assert_eq!(first.position.line_end, 3);

    assert_eq!(second.position.line_start, 4);
    assert_eq!(second.position.line_end, 4);
}

#[test]
fn should_read_crlf_line_endings() {
    let data = "id,name\r\n1,Luis\r\n2,Ana\r\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();

    assert_eq!(first.values, vec!["1", "Luis"]);
    assert_eq!(second.values, vec!["2", "Ana"]);

    assert_eq!(first.position.line_start, 2);
    assert_eq!(second.position.line_start, 3);
}

#[test]
fn should_read_records_with_different_column_counts() {
    let data = "id,name\n1,Luis\n2\n3,Ana,extra\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();
    let third = reader.next_record().unwrap().unwrap();

    assert_eq!(first.values.len(), 2);
    assert_eq!(second.values.len(), 1);
    assert_eq!(third.values.len(), 3);
}

// Archivos físicos y manejo de errores

#[test]
fn should_read_physical_file() {
    let mut file = NamedTempFile::new().unwrap();

    write!(file, "id,name\n1,Luis\n2,Ana\n").unwrap();

    file.flush().unwrap();

    let mut reader = CsvReader::from_path(file.path(), CsvReaderOptions::default()).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis"]);
}

#[test]
fn should_reject_missing_file() {
    let directory = tempfile::tempdir().unwrap();

    let result = CsvReader::from_path(
        directory.path().join("missing.csv"),
        CsvReaderOptions::default(),
    );

    assert!(matches!(result, Err(CsvError::Io(_))));
}

#[test]
fn should_reject_invalid_options() {
    let options = CsvReaderOptions {
        chunk_size: 0,
        ..Default::default()
    };

    let result = CsvReader::new("id,name\n".as_bytes(), options);

    assert!(matches!(
        result,
        Err(CsvError::InvalidOption {
            field: "chunk_size",
            ..
        })
    ));
}

#[test]
fn should_reject_unsupported_encoding() {
    let options = CsvReaderOptions {
        encoding: CsvEncoding::Windows1252,
        ..Default::default()
    };

    let result = CsvReader::new("id,name\n".as_bytes(), options);

    assert!(matches!(result, Err(CsvError::UnsupportedEncoding { .. })));
}

#[test]
fn should_reject_unsupported_normalization() {
    let options = CsvReaderOptions {
        trim: CsvTrim::All,
        ..Default::default()
    };

    let result = CsvReader::new("id,name\n".as_bytes(), options);

    assert!(matches!(
        result,
        Err(CsvError::InvalidOption { field: "trim", .. })
    ));
}

#[test]
fn should_remain_finished_after_eof() {
    let data = "id,name\n1,Luis\n";

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    assert!(reader.next_record().unwrap().is_some());
    assert!(reader.next_record().unwrap().is_none());
    assert!(reader.next_record().unwrap().is_none());

    assert!(reader.is_finished());
    assert!(!reader.is_failed());
    assert_eq!(reader.records_read(), 1);
}

#[test]
fn should_enter_failed_state_after_invalid_utf8() {
    let data = b"id,name\n1,\xFF\n";

    let mut reader = CsvReader::new(data.as_slice(), CsvReaderOptions::default()).unwrap();

    assert!(matches!(reader.next_record(), Err(CsvError::Parser(_))));

    assert!(reader.is_failed());
    assert!(!reader.is_finished());
    assert_eq!(reader.records_read(), 0);

    assert!(matches!(reader.next_record(), Err(CsvError::SessionClosed)));
}

#[test]
fn should_track_multiline_crlf_records() {
    let data = concat!(
        "id,description\r\n",
        "1,\"First line\r\nSecond line\"\r\n",
        "2,Normal record\r\n"
    );

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();

    assert_eq!(first.values[1], "First line\r\nSecond line");

    assert_eq!(first.position.line_start, 2);
    assert_eq!(first.position.line_end, 3);

    assert_eq!(second.position.line_start, 4);
    assert_eq!(second.position.line_end, 4);
}

#[test]
fn should_track_multiline_headers() {
    let data = concat!("id,\"Customer\nName\"\n", "1,Luis\n", "2,Ana\n");

    let mut reader = CsvReader::new(data.as_bytes(), CsvReaderOptions::default()).unwrap();

    let first = reader.next_record().unwrap().unwrap();
    let second = reader.next_record().unwrap().unwrap();

    assert_eq!(first.position.line_start, 3);
    assert_eq!(first.position.line_end, 3);

    assert_eq!(second.position.line_start, 4);
    assert_eq!(second.position.line_end, 4);
}
