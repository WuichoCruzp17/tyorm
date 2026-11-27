use tyorm_batch_csv::*;

// Resolucion de encabezados

fn resolve(names: &[&str]) -> CsvResult<CsvHeaders> {
    CsvHeaderResolver::resolve(
        names.iter().map(|name| name.to_string()).collect(),
        &CsvReaderOptions::default(),
    )
}

#[test]
fn should_resolve_valid_headers() {
    let headers = resolve(&["id", "name", "email"]).unwrap();

    assert_eq!(headers.len(), 3);
    assert!(!headers.is_empty());
}

#[test]
fn should_preserve_header_order() {
    let headers = resolve(&["email", "id", "name"]).unwrap();

    assert_eq!(headers.names(), &["email", "id", "name"]);
}

#[test]
fn should_resolve_column_index() {
    let headers = resolve(&["id", "name", "email"]).unwrap();

    assert_eq!(headers.get_index("id"), Some(0));
    assert_eq!(headers.get_index("name"), Some(1));
    assert_eq!(headers.get_index("email"), Some(2));
}

#[test]
fn should_resolve_column_name() {
    let headers = resolve(&["id", "name", "email"]).unwrap();

    assert_eq!(headers.get_name(0), Some("id"));
    assert_eq!(headers.get_name(2), Some("email"));
}

#[test]
fn should_return_none_for_unknown_column() {
    let headers = resolve(&["id", "name"]).unwrap();

    assert_eq!(headers.get_index("email"), None);
}

#[test]
fn should_return_none_for_invalid_index() {
    let headers = resolve(&["id", "name"]).unwrap();

    assert_eq!(headers.get_name(10), None);
}

#[test]
fn should_check_column_existence() {
    let headers = resolve(&["id", "name"]).unwrap();

    assert!(headers.contains("id"));
    assert!(!headers.contains("email"));
}

#[test]
fn should_iterate_headers_in_order() {
    let headers = resolve(&["id", "name", "email"]).unwrap();

    let columns: Vec<_> = headers.iter().collect();

    assert_eq!(columns, vec![(0, "id"), (1, "name"), (2, "email"),]);
}

//Validacion de encabezados

#[test]
fn should_reject_duplicate_headers() {
    let result = resolve(&["id", "name", "id"]);

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_reject_empty_headers() {
    let result = resolve(&["id", "", "email"]);

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_reject_whitespace_only_headers() {
    let result = resolve(&["id", "   ", "email"]);

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_reject_empty_header_collection() {
    let result = resolve(&[]);

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_preserve_header_whitespace() {
    let headers = resolve(&["id", " name "]).unwrap();

    assert_eq!(headers.get_name(1), Some(" name "));

    assert_eq!(headers.get_index("name"), None);
    assert_eq!(headers.get_index(" name "), Some(1));
}

#[test]
fn should_use_case_sensitive_lookup() {
    let headers = resolve(&["id", "ID"]).unwrap();

    assert_eq!(headers.get_index("id"), Some(0));
    assert_eq!(headers.get_index("ID"), Some(1));
    assert_eq!(headers.get_index("Id"), None);
}

#[test]
fn should_accept_unicode_headers() {
    let headers = resolve(&["id", "descripción", "名前"]).unwrap();

    assert_eq!(headers.get_index("descripción"), Some(1));

    assert_eq!(headers.get_index("名前"), Some(2));
}

#[test]
fn should_reject_null_character_in_header() {
    let result = resolve(&["id", "na\0me"]);

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_reject_control_character_in_header() {
    let result = resolve(&["id", "na\tme"]);

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

//Limite de recursos

#[test]
fn should_reject_too_many_headers() {
    let options = CsvReaderOptions {
        max_columns: 2,
        ..Default::default()
    };

    let result = CsvHeaderResolver::resolve(
        vec!["id".to_string(), "name".to_string(), "email".to_string()],
        &options,
    );

    assert!(matches!(
        result,
        Err(CsvError::ResourceLimitExceeded {
            resource: "header_columns",
            limit: 2,
            actual: 3,
        })
    ));
}

#[test]
fn should_reject_oversized_header() {
    let options = CsvReaderOptions {
        max_field_bytes: 4,
        ..Default::default()
    };

    let result = CsvHeaderResolver::resolve(vec!["customer_id".to_string()], &options);

    assert!(matches!(
        result,
        Err(CsvError::ResourceLimitExceeded {
            resource: "header_field_bytes",
            limit: 4,
            actual: 11,
        })
    ));
}

#[test]
fn should_reject_oversized_header_record() {
    let options = CsvReaderOptions {
        max_field_bytes: 4,
        max_record_bytes: 6,
        ..Default::default()
    };

    let result = CsvHeaderResolver::resolve(vec!["name".to_string(), "code".to_string()], &options);

    assert!(matches!(
        result,
        Err(CsvError::ResourceLimitExceeded {
            resource: "header_record_bytes",
            limit: 6,
            actual: 8,
        })
    ));
}

#[test]
fn should_measure_header_size_in_bytes() {
    let options = CsvReaderOptions {
        max_field_bytes: 2,
        ..Default::default()
    };

    let result = CsvHeaderResolver::resolve(vec!["名".to_string()], &options);

    assert!(matches!(
        result,
        Err(CsvError::ResourceLimitExceeded {
            resource: "header_field_bytes",
            limit: 2,
            actual: 3,
        })
    ));
}

//Integracion deon CsvReader

#[test]
fn should_expose_reader_header_metadata() {
    let reader = CsvReader::new(
        "id,name,email\n1,Luis,test@example.com\n".as_bytes(),
        CsvReaderOptions::default(),
    )
    .unwrap();

    let headers = reader.header_metadata().unwrap();

    assert_eq!(headers.len(), 3);
    assert_eq!(reader.column_count(), Some(3));
    assert_eq!(reader.column_index("email"), Some(2));
    assert_eq!(reader.column_name(1), Some("name"));
    assert!(reader.has_column("id"));
    assert!(!reader.has_column("phone"));
}

#[test]
fn should_reject_reader_with_duplicate_headers() {
    let result = CsvReader::new(
        "id,name,id\n1,Luis,2\n".as_bytes(),
        CsvReaderOptions::default(),
    );

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_reject_reader_with_empty_headers() {
    let result = CsvReader::new(
        "id,,email\n1,Luis,test@example.com\n".as_bytes(),
        CsvReaderOptions::default(),
    );

    assert!(matches!(result, Err(CsvError::InvalidHeaders { .. })));
}

#[test]
fn should_handle_reader_without_header_metadata() {
    let options = CsvReaderOptions {
        has_headers: false,
        ..Default::default()
    };

    let reader = CsvReader::new("1,Luis\n".as_bytes(), options).unwrap();

    assert!(reader.header_metadata().is_none());
    assert_eq!(reader.column_count(), None);
    assert_eq!(reader.column_index("id"), None);
    assert_eq!(reader.column_name(0), None);
    assert!(!reader.has_column("id"));
}

#[test]
fn should_resolve_record_value_by_header() {
    let mut reader = CsvReader::new(
        "id,name,email\n1,Luis,test@example.com\n".as_bytes(),
        CsvReaderOptions::default(),
    )
    .unwrap();

    let index = reader.column_index("email").unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(
        record.values.get(index).map(String::as_str),
        Some("test@example.com")
    );
}
