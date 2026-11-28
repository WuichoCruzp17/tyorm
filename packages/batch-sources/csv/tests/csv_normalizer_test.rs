use tyorm_batch_csv::*;

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

#[test]
fn should_resolve_none_trim_policy() {
    assert!(!CsvTrim::None.trims_headers());
    assert!(!CsvTrim::None.trims_fields());
}

#[test]
fn should_resolve_headers_trim_policy() {
    assert!(CsvTrim::Headers.trims_headers());
    assert!(!CsvTrim::Headers.trims_fields());
}

#[test]
fn should_resolve_fields_trim_policy() {
    assert!(!CsvTrim::Fields.trims_headers());
    assert!(CsvTrim::Fields.trims_fields());
}

#[test]
fn should_resolve_all_trim_policy() {
    assert!(CsvTrim::All.trims_headers());
    assert!(CsvTrim::All.trims_fields());
}

#[test]
fn should_preserve_headers_when_trim_is_none() {
    let mut headers = strings(&[" id ", " name "]);

    let modified = CsvNormalizer::normalize_headers(&mut headers, CsvTrim::None);

    assert_eq!(modified, 0);
    assert_eq!(headers, vec![" id ", " name "]);
}

#[test]
fn should_trim_headers() {
    let mut headers = strings(&[" id ", " name "]);

    let modified = CsvNormalizer::normalize_headers(&mut headers, CsvTrim::Headers);

    assert_eq!(modified, 2);
    assert_eq!(headers, vec!["id", "name"]);
}

#[test]
fn should_not_trim_headers_in_fields_mode() {
    let mut headers = strings(&[" id ", " name "]);

    let modified = CsvNormalizer::normalize_headers(&mut headers, CsvTrim::Fields);

    assert_eq!(modified, 0);
    assert_eq!(headers, vec![" id ", " name "]);
}

#[test]
fn should_trim_headers_in_all_mode() {
    let mut headers = strings(&[" id ", " name "]);

    let modified = CsvNormalizer::normalize_headers(&mut headers, CsvTrim::All);

    assert_eq!(modified, 2);
    assert_eq!(headers, vec!["id", "name"]);
}

#[test]
fn should_preserve_fields_when_trim_is_none() {
    let mut fields = strings(&[" 1 ", " Luis "]);

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::None);

    assert_eq!(modified, 0);
    assert_eq!(fields, vec![" 1 ", " Luis "]);
}

#[test]
fn should_not_trim_fields_in_headers_mode() {
    let mut fields = strings(&[" 1 ", " Luis "]);

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::Headers);

    assert_eq!(modified, 0);
    assert_eq!(fields, vec![" 1 ", " Luis "]);
}

#[test]
fn should_trim_fields() {
    let mut fields = strings(&[" 1 ", " Luis "]);

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::Fields);

    assert_eq!(modified, 2);
    assert_eq!(fields, vec!["1", "Luis"]);
}

#[test]
fn should_trim_fields_in_all_mode() {
    let mut fields = strings(&[" 1 ", " Luis "]);

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(modified, 2);
    assert_eq!(fields, vec!["1", "Luis"]);
}

#[test]
fn should_preserve_internal_whitespace() {
    let mut fields = strings(&[" Luis  Segura "]);

    CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(fields[0], "Luis  Segura");
}

#[test]
fn should_preserve_leading_zeroes() {
    let mut fields = strings(&[" 000123 "]);

    CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(fields[0], "000123");
}

#[test]
fn should_preserve_decimal_representation() {
    let mut fields = strings(&[" 12.5000 "]);

    CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(fields[0], "12.5000");
}

#[test]
fn should_preserve_case() {
    let mut fields = strings(&[" AcTiVe "]);

    CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(fields[0], "AcTiVe");
}

#[test]
fn should_trim_unicode_whitespace() {
    let mut fields = strings(&["\u{00A0}José\u{3000}"]);

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(modified, 1);
    assert_eq!(fields[0], "José");
}

#[test]
fn should_preserve_multibyte_characters() {
    let mut fields = strings(&[" 東京 ", " 😀 ", " José "]);

    CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(fields, vec!["東京", "😀", "José"]);
}

#[test]
fn should_convert_whitespace_only_field_to_empty() {
    let mut fields = strings(&[" \t\r\n "]);

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(modified, 1);
    assert!(fields[0].is_empty());
}

#[test]
fn should_preserve_empty_field() {
    let mut fields = strings(&[""]);

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(modified, 0);
    assert!(fields[0].is_empty());
}

#[test]
fn should_handle_empty_collection() {
    let mut fields: Vec<String> = Vec::new();

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(modified, 0);
}

#[test]
fn should_preserve_suspicious_characters() {
    let mut fields = strings(&[" \u{200B}Luis\u{FEFF} "]);

    CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(fields[0], "\u{200B}Luis\u{FEFF}");
}

#[test]
fn should_preserve_internal_line_breaks() {
    let mut fields = strings(&[" First\r\nSecond "]);

    CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(fields[0], "First\r\nSecond");
}

#[test]
fn should_count_only_modified_values() {
    let mut fields = strings(&["Luis", " Ana ", "", " Pedro "]);

    let modified = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(modified, 2);
}

#[test]
fn should_reuse_existing_string_allocation() {
    let mut fields = strings(&[" Luis "]);

    let pointer = fields[0].as_ptr();
    let capacity = fields[0].capacity();

    CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(fields[0].as_ptr(), pointer);
    assert_eq!(fields[0].capacity(), capacity);
    assert_eq!(fields[0], "Luis");
}

#[test]
fn should_be_idempotent() {
    let mut fields = strings(&[" Luis ", " Ana "]);

    let first = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    let second = CsvNormalizer::normalize_fields(&mut fields, CsvTrim::All);

    assert_eq!(first, 2);
    assert_eq!(second, 0);
    assert_eq!(fields, vec!["Luis", "Ana"]);
}
