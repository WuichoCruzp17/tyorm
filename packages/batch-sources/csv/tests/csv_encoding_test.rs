use std::io::{self, Read};

use tyorm_batch_csv::*;

//Funciones auxiliares
fn options(encoding: CsvEncoding) -> CsvReaderOptions {
    CsvReaderOptions {
        encoding,
        ..Default::default()
    }
}

fn encode_utf16(text: &str, little_endian: bool, with_bom: bool) -> Vec<u8> {
    let mut bytes = Vec::new();

    if with_bom {
        if little_endian {
            bytes.extend_from_slice(&[0xFF, 0xFE]);
        } else {
            bytes.extend_from_slice(&[0xFE, 0xFF]);
        }
    }

    for unit in text.encode_utf16() {
        let encoded = if little_endian {
            unit.to_le_bytes()
        } else {
            unit.to_be_bytes()
        };

        bytes.extend_from_slice(&encoded);
    }

    bytes
}

//Pruebas  de deteccion

#[test]
fn should_detect_utf8_bom() {
    let detection = CsvEncodingDetector::detect(&[0xEF, 0xBB, 0xBF], CsvEncoding::Auto).unwrap();

    assert_eq!(detection.encoding, CsvEncoding::Utf8);
    assert_eq!(detection.bom_length, 3);
}

#[test]
fn should_detect_utf16le_bom() {
    let detection = CsvEncodingDetector::detect(&[0xFF, 0xFE], CsvEncoding::Auto).unwrap();

    assert_eq!(detection.encoding, CsvEncoding::Utf16Le);
    assert_eq!(detection.bom_length, 2);
}

#[test]
fn should_detect_utf16be_bom() {
    let detection = CsvEncodingDetector::detect(&[0xFE, 0xFF], CsvEncoding::Auto).unwrap();

    assert_eq!(detection.encoding, CsvEncoding::Utf16Be);
    assert_eq!(detection.bom_length, 2);
}

#[test]
fn should_default_to_utf8_without_bom() {
    let detection = CsvEncodingDetector::detect(b"id,name", CsvEncoding::Auto).unwrap();

    assert_eq!(detection.encoding, CsvEncoding::Utf8);
    assert_eq!(detection.bom_length, 0);
}

#[test]
fn should_preserve_explicit_windows1252() {
    let detection = CsvEncodingDetector::detect(b"id,name", CsvEncoding::Windows1252).unwrap();

    assert_eq!(detection.encoding, CsvEncoding::Windows1252);
}

#[test]
fn should_reject_utf32le() {
    let result = CsvEncodingDetector::detect(&[0xFF, 0xFE, 0x00, 0x00], CsvEncoding::Auto);

    assert!(matches!(result, Err(CsvError::UnsupportedEncoding { .. })));
}

#[test]
fn should_reject_utf32be() {
    let result = CsvEncodingDetector::detect(&[0x00, 0x00, 0xFE, 0xFF], CsvEncoding::Auto);

    assert!(matches!(result, Err(CsvError::UnsupportedEncoding { .. })));
}

#[test]
fn should_reject_conflicting_bom() {
    let result = CsvEncodingDetector::detect(&[0xFE, 0xFF], CsvEncoding::Utf16Le);

    assert!(matches!(
        result,
        Err(CsvError::EncodingMismatch {
            requested: CsvEncoding::Utf16Le,
            detected: CsvEncoding::Utf16Be,
        })
    ));
}

// UTF-8 y Windows-1252
#[test]
fn should_read_utf8_without_bom() {
    let data = "id,name\n1,José\n";

    let mut reader = CsvReader::new(data.as_bytes(), options(CsvEncoding::Utf8)).unwrap();

    assert_eq!(reader.detected_encoding(), CsvEncoding::Utf8);

    assert!(!reader.has_bom());

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "José"]);
}

#[test]
fn should_remove_utf8_bom_from_headers() {
    let data = b"\xEF\xBB\xBFid,name\n1,Luis\n";

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    assert!(reader.has_bom());
    assert_eq!(reader.bom_length(), 3);
    assert_eq!(reader.column_index("id"), Some(0));

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis"]);
}

#[test]
fn should_read_explicit_utf8_with_bom() {
    let data = b"\xEF\xBB\xBFid,name\n1,Luis\n";

    let reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Utf8)).unwrap();

    assert!(reader.has_bom());

    assert_eq!(reader.headers().unwrap(), &["id", "name"]);
}

#[test]
fn should_read_windows1252_accents() {
    let data = b"id,name\n1,Jos\xE9 Hern\xE1ndez\n";

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Windows1252)).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "José Hernández");
}

#[test]
fn should_read_windows1252_special_characters() {
    let data = b"id,description\n1,\x80 \x93Hello\x94\n";

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Windows1252)).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "€ “Hello”");
}

#[test]
fn should_not_guess_windows1252_automatically() {
    let data = b"id,name\n1,Jos\xE9\n";

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    assert_eq!(reader.detected_encoding(), CsvEncoding::Utf8);

    assert!(reader.next_record().is_err());
}

// UTF-16 LE y BE
#[test]
fn should_read_utf16le_with_bom() {
    let data = encode_utf16("id,name\n1,José\n", true, true);

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    assert_eq!(reader.detected_encoding(), CsvEncoding::Utf16Le);

    assert!(reader.has_bom());

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "José"]);
}

#[test]
fn should_read_utf16be_with_bom() {
    let data = encode_utf16("id,name\n1,José\n", false, true);

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    assert_eq!(reader.detected_encoding(), CsvEncoding::Utf16Be);

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "José"]);
}

#[test]
fn should_read_utf16le_without_bom() {
    let data = encode_utf16("id,name\n1,Luis\n", true, false);

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Utf16Le)).unwrap();

    assert!(!reader.has_bom());

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis"]);
}

#[test]
fn should_read_utf16be_without_bom() {
    let data = encode_utf16("id,name\n1,Luis\n", false, false);

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Utf16Be)).unwrap();

    assert!(!reader.has_bom());

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis"]);
}

#[test]
fn should_read_utf16_surrogate_pairs() {
    let data = encode_utf16("id,name\n1,東京 😀\n", true, true);

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "東京 😀");
}

#[test]
fn should_read_utf16_multiline_records() {
    let data = encode_utf16("id,description\r\n1,\"First\r\nSecond\"\r\n", true, true);

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "First\r\nSecond");

    assert_eq!(record.position.line_start, 2);
    assert_eq!(record.position.line_end, 3);
}

//Secuencias inválidas
#[test]
fn should_reject_truncated_utf16() {
    let data = [0xFF, 0xFE, 0x41];

    let mut reader = CsvDecodedReader::new(data.as_slice(), CsvEncoding::Auto).unwrap();

    let mut output = String::new();

    let error = reader.read_to_string(&mut output).unwrap_err();

    assert_eq!(error.kind(), io::ErrorKind::InvalidData);
}

#[test]
fn should_reject_unpaired_utf16_surrogate() {
    let data = [0xFF, 0xFE, 0x00, 0xD8, 0x41, 0x00];

    let mut reader = CsvDecodedReader::new(data.as_slice(), CsvEncoding::Auto).unwrap();

    let mut output = String::new();

    let error = reader.read_to_string(&mut output).unwrap_err();

    assert_eq!(error.kind(), io::ErrorKind::InvalidData);
}

#[test]
fn should_preserve_valid_replacement_character() {
    let data = encode_utf16("id,name\n1,\u{FFFD}\n", true, true);

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "\u{FFFD}");
}

#[test]
fn should_handle_empty_encoded_stream() {
    let data: &[u8] = &[];

    let mut reader = CsvReader::new(data, options(CsvEncoding::Auto)).unwrap();

    assert!(reader.next_record().unwrap().is_none());
    assert!(reader.is_finished());
}

#[test]
fn should_handle_bom_only_stream() {
    let data = [0xFF, 0xFE];

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    assert!(reader.has_bom());
    assert!(reader.next_record().unwrap().is_none());
}

//Pruebas de lecturas incremental

struct OneByteReader<R: Read> {
    source: R,
}

impl<R: Read> Read for OneByteReader<R> {
    fn read(&mut self, destination: &mut [u8]) -> io::Result<usize> {
        if destination.is_empty() {
            return Ok(0);
        }

        self.source.read(&mut destination[..1])
    }
}

#[test]
fn should_detect_bom_across_partial_reads() {
    let data = b"\xEF\xBB\xBFid,name\n1,Luis\n";

    let source = OneByteReader {
        source: data.as_slice(),
    };

    let mut reader = CsvReader::new(source, options(CsvEncoding::Auto)).unwrap();

    assert!(reader.has_bom());

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values, vec!["1", "Luis"]);
}

#[test]
fn should_decode_utf16_across_partial_reads() {
    let data = encode_utf16("id,name\n1,José 😀\n", true, true);

    let source = OneByteReader {
        source: data.as_slice(),
    };

    let mut reader = CsvReader::new(source, options(CsvEncoding::Auto)).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], "José 😀");
}

#[test]
fn should_decode_large_utf16_field() {
    let value = "José 😀".repeat(5000);

    let text = format!("id,name\n1,{value}\n");

    let data = encode_utf16(&text, true, true);

    let mut reader = CsvReader::new(data.as_slice(), options(CsvEncoding::Auto)).unwrap();

    let record = reader.next_record().unwrap().unwrap();

    assert_eq!(record.values[1], value);
}

#[test]
fn should_support_single_byte_output_buffer() {
    let data = encode_utf16("José 😀", true, true);

    let mut reader = CsvDecodedReader::new(data.as_slice(), CsvEncoding::Auto).unwrap();

    let mut output = Vec::new();
    let mut buffer = [0u8; 1];

    loop {
        let count = reader.read(&mut buffer).unwrap();

        if count == 0 {
            break;
        }

        output.extend_from_slice(&buffer[..count]);
    }

    assert_eq!(String::from_utf8(output).unwrap(), "José 😀");
}
