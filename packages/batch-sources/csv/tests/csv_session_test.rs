use std::io::{self, Read, Write};

use tempfile::NamedTempFile;

use tyorm_batch_csv::*;

fn options(chunk_size: usize) -> CsvReaderOptions {
    CsvReaderOptions {
        chunk_size,
        ..Default::default()
    }
}

const DATA: &str = concat!(
    "id,name\n",
    "1,Luis\n",
    "2,Ana\n",
    "3,Pedro\n",
    "4,Maria\n",
    "5,Carlos\n"
);

#[test]
fn should_create_active_session() {
    let session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    assert_eq!(session.state(), CsvSessionState::Active,);

    assert_eq!(session.statistics().records_read, 0,);
}

#[test]
fn should_read_chunks_sequentially() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    let first = session.next_chunk().unwrap().unwrap();

    let second = session.next_chunk().unwrap().unwrap();

    let third = session.next_chunk().unwrap().unwrap();

    assert_eq!(first.len(), 2);
    assert_eq!(second.len(), 2);
    assert_eq!(third.len(), 1);

    assert_eq!(first.chunk_number, 1);
    assert_eq!(second.chunk_number, 2);
    assert_eq!(third.chunk_number, 3);

    assert!(session.next_chunk().unwrap().is_none());
}

#[test]
fn should_preserve_record_order_across_chunks() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    let mut numbers = Vec::new();

    while let Some(chunk) = session.next_chunk().unwrap() {
        numbers.extend(
            chunk
                .records
                .into_iter()
                .map(|record| record.position.record_number),
        );
    }

    assert_eq!(numbers, vec![1, 2, 3, 4, 5]);
}

#[test]
fn should_handle_empty_session() {
    let mut session = CsvSession::new("".as_bytes(), options(2)).unwrap();

    assert!(session.next_chunk().unwrap().is_none());

    assert_eq!(session.state(), CsvSessionState::Completed,);
}

#[test]
fn should_handle_headers_only_session() {
    let mut session = CsvSession::new("id,name\n".as_bytes(), options(2)).unwrap();

    assert!(session.next_chunk().unwrap().is_none());

    assert_eq!(session.headers().unwrap(), &["id", "name"],);

    assert_eq!(session.statistics().chunks_delivered, 0,);
}

#[test]
fn should_remain_completed_after_eof() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(10)).unwrap();

    assert!(session.next_chunk().unwrap().is_some());

    assert_eq!(session.state(), CsvSessionState::Completed,);

    assert!(session.next_chunk().unwrap().is_none());
    assert!(session.next_chunk().unwrap().is_none());
}

#[test]
fn should_not_emit_empty_chunk_at_exact_boundary() {
    let mut session = CsvSession::new("id\n1\n2\n".as_bytes(), options(2)).unwrap();

    let chunk = session.next_chunk().unwrap().unwrap();

    assert_eq!(chunk.len(), 2);

    assert!(session.next_chunk().unwrap().is_none());

    assert_eq!(session.statistics().chunks_delivered, 1,);
}

#[test]
fn should_split_chunks_by_payload_bytes() {
    let data = "name\nLuis\nAna\nPedro\n";

    let options = CsvReaderOptions {
        chunk_size: 100,

        max_field_bytes: 6,
        max_record_bytes: 6,
        max_chunk_bytes: 6,

        ..Default::default()
    };

    let mut session = CsvSession::new(data.as_bytes(), options).unwrap();

    let first = session.next_chunk().unwrap().unwrap();

    let second = session.next_chunk().unwrap().unwrap();

    let third = session.next_chunk().unwrap().unwrap();

    assert_eq!(first.payload_bytes, 4);
    assert_eq!(second.payload_bytes, 3);
    assert_eq!(third.payload_bytes, 5);

    assert!(session.next_chunk().unwrap().is_none());
}

#[test]
fn should_preserve_pending_record() {
    let data = "name\nLuis\nAna\n";

    let options = CsvReaderOptions {
        chunk_size: 100,

        max_field_bytes: 6,
        max_record_bytes: 6,
        max_chunk_bytes: 6,

        ..Default::default()
    };

    let mut session = CsvSession::new(data.as_bytes(), options).unwrap();

    let first = session.next_chunk().unwrap().unwrap();

    assert_eq!(first.records[0].values[0], "Luis");

    assert_eq!(session.statistics().records_read, 2,);

    assert_eq!(session.statistics().records_delivered, 1,);

    assert_eq!(session.statistics().undelivered_records(), 1,);

    let second = session.next_chunk().unwrap().unwrap();

    assert_eq!(second.records[0].values[0], "Ana");

    assert_eq!(session.statistics().records_delivered, 2,);

    assert_eq!(session.statistics().undelivered_records(), 0,);
}

#[test]
fn should_fail_when_record_cannot_fit_any_chunk() {
    let data = "id\n123456789\n";

    let options = CsvReaderOptions {
        max_field_bytes: 4,
        max_record_bytes: 4,
        max_chunk_bytes: 4,

        error_policy: CsvErrorPolicy::ContinueOnError,

        ..Default::default()
    };

    let mut session = CsvSession::new(data.as_bytes(), options).unwrap();

    assert!(matches!(
        session.next_chunk(),
        Err(CsvError::ResourceLimitExceeded {
            resource: "chunk_record_bytes",
            ..
        })
    ));

    assert_eq!(session.state(), CsvSessionState::Failed,);
}

#[test]
fn should_accumulate_session_statistics() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    while session.next_chunk().unwrap().is_some() {}

    let statistics = session.statistics();

    assert_eq!(statistics.records_read, 5);
    assert_eq!(statistics.records_delivered, 5);

    assert_eq!(statistics.valid_records, 5);
    assert_eq!(statistics.invalid_records, 0);

    assert_eq!(statistics.chunks_delivered, 3);

    assert_eq!(statistics.payload_bytes_delivered, 28,);
}

#[test]
fn should_count_invalid_records() {
    let data = "id,name\n1,Luis\n2\n3,Ana\n";

    let mut session = CsvSession::new(data.as_bytes(), options(10)).unwrap();

    let chunk = session.next_chunk().unwrap().unwrap();

    assert_eq!(chunk.valid_count(), 2);
    assert_eq!(chunk.invalid_count(), 1);

    let statistics = session.statistics();

    assert_eq!(statistics.valid_records, 2);
    assert_eq!(statistics.invalid_records, 1);

    assert_eq!(statistics.error_count, 2);
}

#[test]
fn should_count_warning_records() {
    let data = "id,name\n1,Luis\u{200B}\n2,Ana\n";

    let mut session = CsvSession::new(data.as_bytes(), options(10)).unwrap();

    session.next_chunk().unwrap();

    let statistics = session.statistics();

    assert_eq!(statistics.valid_records, 2);
    assert_eq!(statistics.invalid_records, 0);

    assert_eq!(statistics.warning_count, 1);
    assert_eq!(statistics.records_with_warnings, 1);
}

#[test]
fn should_measure_normalized_payload() {
    let data = "id,name\n 1 , Luis \n";

    let options = CsvReaderOptions {
        trim: CsvTrim::All,
        ..Default::default()
    };

    let mut session = CsvSession::new(data.as_bytes(), options).unwrap();

    let chunk = session.next_chunk().unwrap().unwrap();

    assert_eq!(chunk.payload_bytes, 5);

    assert_eq!(session.statistics().payload_bytes_delivered, 5,);
}

#[test]
fn should_cancel_active_session() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    session.cancel();

    assert_eq!(session.state(), CsvSessionState::Cancelled,);

    assert!(matches!(session.next_chunk(), Err(CsvError::Cancelled)));
}

#[test]
fn should_cancel_session_using_external_token() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    let token = session.cancellation_token();

    token.cancel();

    assert!(matches!(session.next_chunk(), Err(CsvError::Cancelled)));

    assert_eq!(session.state(), CsvSessionState::Cancelled,);
}

#[test]
fn should_preserve_statistics_after_cancellation() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    session.next_chunk().unwrap();

    session.cancel();

    assert_eq!(session.statistics().records_delivered, 2,);

    assert_eq!(session.statistics().chunks_delivered, 1,);
}

#[test]
fn should_close_session() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    session.close();

    assert_eq!(session.state(), CsvSessionState::Closed,);

    assert!(matches!(session.next_chunk(), Err(CsvError::SessionClosed)));
}

#[test]
fn should_close_session_idempotently() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    session.close();
    session.close();

    assert_eq!(session.state(), CsvSessionState::Closed,);
}

#[test]
fn should_preserve_metadata_after_close() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    session.close();

    assert_eq!(session.headers().unwrap(), &["id", "name"],);

    assert_eq!(session.detected_encoding(), CsvEncoding::Utf8,);
}

#[test]
fn should_not_cancel_completed_session() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(100)).unwrap();

    session.next_chunk().unwrap();

    session.cancel();

    assert_eq!(session.state(), CsvSessionState::Completed,);
}

#[test]
fn should_fail_session_on_fail_fast_error() {
    let data = "id,name\n1,Luis\n2\n3,Ana\n";

    let options = CsvReaderOptions {
        chunk_size: 10,
        error_policy: CsvErrorPolicy::FailFast,
        ..Default::default()
    };

    let mut session = CsvSession::new(data.as_bytes(), options).unwrap();

    assert!(matches!(
        session.next_chunk(),
        Err(CsvError::RecordRejected { .. })
    ));

    assert_eq!(session.state(), CsvSessionState::Failed,);

    assert!(matches!(session.next_chunk(), Err(CsvError::SessionClosed)));
}

#[test]
fn should_discard_partial_chunk_on_failure() {
    let data = "id,name\n1,Luis\n2\n";

    let options = CsvReaderOptions {
        chunk_size: 10,
        error_policy: CsvErrorPolicy::FailFast,
        ..Default::default()
    };

    let mut session = CsvSession::new(data.as_bytes(), options).unwrap();

    assert!(session.next_chunk().is_err());

    let statistics = session.statistics();

    assert_eq!(statistics.records_read, 2);
    assert_eq!(statistics.records_delivered, 0);
    assert_eq!(statistics.chunks_delivered, 0);
    assert_eq!(statistics.undelivered_records(), 2);
}

#[test]
fn should_preserve_previously_delivered_chunks() {
    let data = "id,name\n1,Luis\n2,Ana\n3\n";

    let options = CsvReaderOptions {
        chunk_size: 2,
        error_policy: CsvErrorPolicy::FailFast,
        ..Default::default()
    };

    let mut session = CsvSession::new(data.as_bytes(), options).unwrap();

    let first = session.next_chunk().unwrap().unwrap();

    assert_eq!(first.len(), 2);

    assert!(session.next_chunk().is_err());

    assert_eq!(session.statistics().records_delivered, 2,);

    assert_eq!(session.statistics().records_read, 3,);
}

#[test]
fn should_fail_session_on_invalid_utf8() {
    let data = b"id,name\n1,\xFF\n";

    let mut session = CsvSession::new(data.as_slice(), options(10)).unwrap();

    assert!(session.next_chunk().is_err());

    assert_eq!(session.state(), CsvSessionState::Failed,);
}

#[test]
fn should_read_records_only_when_requested() {
    let mut session = CsvSession::new(DATA.as_bytes(), options(2)).unwrap();

    assert_eq!(session.statistics().records_read, 0,);

    session.next_chunk().unwrap();

    assert_eq!(session.statistics().records_read, 2,);

    session.next_chunk().unwrap();

    assert_eq!(session.statistics().records_read, 4,);

    session.next_chunk().unwrap();

    assert_eq!(session.statistics().records_read, 5,);
}

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

struct CountingReader<R: Read> {
    source: R,
    bytes_read: Arc<AtomicUsize>,
}

impl<R: Read> Read for CountingReader<R> {
    fn read(&mut self, destination: &mut [u8]) -> io::Result<usize> {
        let count = self.source.read(destination)?;

        self.bytes_read.fetch_add(count, Ordering::Relaxed);

        Ok(count)
    }
}

#[test]
fn should_not_read_entire_large_source_for_first_chunk() {
    let data = format!("id,name\n{}", "1,Luis\n".repeat(100_000),);

    let total_bytes = data.len();

    let bytes_read = Arc::new(AtomicUsize::new(0));

    let source = CountingReader {
        source: data.as_bytes(),
        bytes_read: bytes_read.clone(),
    };

    let mut session = CsvSession::new(source, options(10)).unwrap();

    let chunk = session.next_chunk().unwrap().unwrap();

    assert_eq!(chunk.len(), 10);

    assert!(bytes_read.load(Ordering::Relaxed) < total_bytes);
}

#[test]
fn should_create_session_from_file() {
    let mut file = NamedTempFile::new().unwrap();

    write!(file, "{DATA}").unwrap();

    file.flush().unwrap();

    let mut session = CsvSession::from_path(file.path(), options(2)).unwrap();

    let chunk = session.next_chunk().unwrap().unwrap();

    assert_eq!(chunk.len(), 2);

    session.close();
}

#[test]
fn should_release_source_when_closed() {
    struct DropReader<'a> {
        source: &'a [u8],
        dropped: Arc<AtomicUsize>,
    }

    impl Read for DropReader<'_> {
        fn read(&mut self, destination: &mut [u8]) -> io::Result<usize> {
            self.source.read(destination)
        }
    }

    impl Drop for DropReader<'_> {
        fn drop(&mut self) {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }

    let dropped = Arc::new(AtomicUsize::new(0));

    let source = DropReader {
        source: DATA.as_bytes(),
        dropped: dropped.clone(),
    };

    let mut session = CsvSession::new(source, options(2)).unwrap();

    assert_eq!(dropped.load(Ordering::Relaxed), 0,);

    session.close();

    assert_eq!(dropped.load(Ordering::Relaxed), 1,);

    session.close();

    assert_eq!(dropped.load(Ordering::Relaxed), 1,);
}
