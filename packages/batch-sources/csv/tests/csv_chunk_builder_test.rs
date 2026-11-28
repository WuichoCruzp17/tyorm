use tyorm_batch_csv::*;

fn record(number: u64, values: &[&str]) -> RawBatchRecord {
    RawBatchRecord {
        position: CsvPosition {
            record_number: number,
            line_start: number,
            line_end: number,
            byte_offset: 0,
        },

        values: values.iter().map(|value| value.to_string()).collect(),

        anomalies: Vec::new(),
    }
}

fn options(chunk_size: usize, max_bytes: usize) -> CsvReaderOptions {
    CsvReaderOptions {
        chunk_size,

        max_field_bytes: max_bytes,
        max_record_bytes: max_bytes,
        max_chunk_bytes: max_bytes,

        ..Default::default()
    }
}

#[test]
fn should_create_empty_chunk_builder() {
    let builder = CsvChunkBuilder::new(1, &options(10, 100)).unwrap();

    assert!(builder.is_empty());
    assert_eq!(builder.len(), 0);
    assert_eq!(builder.payload_bytes(), 0);
    assert!(!builder.is_full());
}

#[test]
fn should_push_record() {
    let mut builder = CsvChunkBuilder::new(1, &options(10, 100)).unwrap();

    builder.try_push(record(1, &["Luis"])).unwrap();

    assert_eq!(builder.len(), 1);
    assert_eq!(builder.payload_bytes(), 4);
}

#[test]
fn should_respect_record_count_limit() {
    let mut builder = CsvChunkBuilder::new(1, &options(2, 100)).unwrap();

    builder.try_push(record(1, &["Luis"])).unwrap();

    builder.try_push(record(2, &["Ana"])).unwrap();

    assert!(builder.is_full());

    assert!(builder.try_push(record(3, &["Pedro"]),).is_err());
}

#[test]
fn should_respect_payload_byte_limit() {
    let mut builder = CsvChunkBuilder::new(1, &options(10, 6)).unwrap();

    builder.try_push(record(1, &["Luis"])).unwrap();

    assert!(!builder.can_accept(&record(2, &["Ana"]),));

    assert_eq!(builder.payload_bytes(), 4);
}

#[test]
fn should_accept_exact_byte_limit() {
    let mut builder = CsvChunkBuilder::new(1, &options(10, 7)).unwrap();

    builder.try_push(record(1, &["Luis"])).unwrap();

    builder.try_push(record(2, &["Ana"])).unwrap();

    assert_eq!(builder.payload_bytes(), 7);
    assert!(builder.is_full());
}

#[test]
fn should_return_record_when_it_does_not_fit() {
    let mut builder = CsvChunkBuilder::new(1, &options(1, 100)).unwrap();

    builder.try_push(record(1, &["Luis"])).unwrap();

    let second = record(2, &["Ana"]);

    let rejected = builder.try_push(second.clone()).unwrap_err();

    assert_eq!(rejected, second);
    assert_eq!(builder.len(), 1);
}

#[test]
fn should_reject_oversized_individual_record() {
    let mut builder = CsvChunkBuilder::new(1, &options(10, 3)).unwrap();

    let result = builder.try_push(record(1, &["Luis"]));

    assert!(result.is_err());
    assert!(builder.is_empty());
}

#[test]
fn should_measure_utf8_payload_bytes() {
    let record = record(1, &["José", "東京", "😀"]);

    assert_eq!(CsvChunkBuilder::record_payload_bytes(&record,), 15,);
}

#[test]
fn should_preserve_record_order() {
    let mut builder = CsvChunkBuilder::new(1, &options(10, 100)).unwrap();

    for number in 1..=3 {
        builder.try_push(record(number, &["value"])).unwrap();
    }

    let chunk = builder.finish();

    let numbers: Vec<u64> = chunk
        .records
        .iter()
        .map(|record| record.position.record_number)
        .collect();

    assert_eq!(numbers, vec![1, 2, 3]);
}

#[test]
fn should_preserve_chunk_number() {
    let mut builder = CsvChunkBuilder::new(25, &options(10, 100)).unwrap();

    builder.try_push(record(1, &["Luis"])).unwrap();

    let chunk = builder.finish();

    assert_eq!(chunk.chunk_number, 25);
    assert_eq!(chunk.payload_bytes, 4);
}

#[test]
fn should_accept_zero_payload_record() {
    let mut builder = CsvChunkBuilder::new(10, &options(10, 100)).unwrap();

    builder.try_push(record(1, &["", ""])).unwrap();

    assert_eq!(builder.len(), 1);
    assert_eq!(builder.payload_bytes(), 0);
}

#[test]
fn should_reject_invalid_builder_options() {
    let options = CsvReaderOptions {
        chunk_size: 0,
        ..Default::default()
    };

    let result = CsvChunkBuilder::new(1, &options);

    assert!(matches!(result, Err(CsvError::InvalidOption { .. })));
}
