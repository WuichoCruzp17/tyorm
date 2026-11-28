use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::contracts::{
    CsvChunk, CsvEncoding, CsvHeaders, CsvReaderOptions, CsvSessionState, CsvSessionStatistics,
    RawBatchRecord,
};

use crate::errors::{CsvError, CsvResult};

use crate::parser::CsvReader;

use super::cancellation_token::CsvCancellationToken;
use super::chunk_builder::CsvChunkBuilder;

pub struct CsvSession<R: Read> {
    reader: Option<CsvReader<R>>,

    options: CsvReaderOptions,

    state: CsvSessionState,
    statistics: CsvSessionStatistics,

    cancellation_token: CsvCancellationToken,

    pending_record: Option<RawBatchRecord>,

    next_chunk_number: u64,

    detected_encoding: CsvEncoding,
    headers: Option<CsvHeaders>,
}

impl<R: Read> CsvSession<R> {
    pub fn new(source: R, options: CsvReaderOptions) -> CsvResult<Self> {
        let reader = CsvReader::new(source, options)?;

        Ok(Self::from_reader(reader))
    }

    pub fn from_reader(reader: CsvReader<R>) -> Self {
        let options = reader.options().clone();

        let detected_encoding = reader.detected_encoding();

        let headers = reader.header_metadata().cloned();

        let state = if reader.is_failed() {
            CsvSessionState::Failed
        } else if reader.is_finished() {
            CsvSessionState::Completed
        } else {
            CsvSessionState::Active
        };

        let statistics = CsvSessionStatistics {
            records_read: reader.records_read(),
            ..Default::default()
        };

        let reader = if state.is_active() {
            Some(reader)
        } else {
            None
        };

        Self {
            reader,
            options,
            state,
            statistics,

            cancellation_token: CsvCancellationToken::new(),

            pending_record: None,
            next_chunk_number: 1,

            detected_encoding,
            headers,
        }
    }

    pub fn next_chunk(&mut self) -> CsvResult<Option<CsvChunk>> {
        match self.state {
            CsvSessionState::Completed => {
                return Ok(None);
            }

            CsvSessionState::Cancelled => {
                return Err(CsvError::Cancelled);
            }

            CsvSessionState::Failed | CsvSessionState::Closed => {
                return Err(CsvError::SessionClosed);
            }

            CsvSessionState::Active => {}
        }

        let result = self.build_next_chunk();

        match result {
            Ok(chunk) => Ok(chunk),

            Err(error) => {
                let state = if matches!(&error, CsvError::Cancelled) {
                    CsvSessionState::Cancelled
                } else {
                    CsvSessionState::Failed
                };

                self.terminate(state);

                Err(error)
            }
        }
    }

    fn build_next_chunk(&mut self) -> CsvResult<Option<CsvChunk>> {
        self.check_cancellation()?;

        let mut builder = CsvChunkBuilder::new(self.next_chunk_number, &self.options)?;

        let mut reached_eof = false;

        while !builder.is_full() {
            self.check_cancellation()?;

            let Some(record) = self.take_next_record()? else {
                reached_eof = true;
                break;
            };

            self.check_cancellation()?;

            if let Err(record) = builder.try_push(record) {
                if builder.is_empty() {
                    return Err(CsvChunkBuilder::oversized_record_error(
                        &record,
                        &self.options,
                    ));
                }

                self.pending_record = Some(record);

                break;
            }
        }

        self.check_cancellation()?;

        if builder.is_empty() {
            if reached_eof {
                self.terminate(CsvSessionState::Completed);
            }

            return Ok(None);
        }

        let chunk = builder.finish();

        self.statistics.register_chunk(&chunk);

        self.next_chunk_number += 1;

        if reached_eof {
            self.terminate(CsvSessionState::Completed);
        }

        Ok(Some(chunk))
    }

    fn take_next_record(&mut self) -> CsvResult<Option<RawBatchRecord>> {
        if let Some(record) = self.pending_record.take() {
            return Ok(Some(record));
        }

        let reader = self.reader.as_mut().ok_or(CsvError::SessionClosed)?;

        let result = reader.next_record();

        self.statistics.records_read = reader.records_read();

        result
    }

    fn check_cancellation(&self) -> CsvResult<()> {
        if self.cancellation_token.is_cancelled() {
            return Err(CsvError::Cancelled);
        }

        Ok(())
    }

    fn terminate(&mut self, state: CsvSessionState) {
        self.pending_record = None;

        // Drop the reader and release its resources.
        self.reader = None;

        self.state = state;
    }

    pub fn cancel(&mut self) {
        if self.state.is_active() {
            self.cancellation_token.cancel();

            self.terminate(CsvSessionState::Cancelled);
        }
    }

    pub fn close(&mut self) {
        if self.state != CsvSessionState::Closed {
            self.terminate(CsvSessionState::Closed);
        }
    }

    pub fn cancellation_token(&self) -> CsvCancellationToken {
        self.cancellation_token.clone()
    }

    pub fn state(&self) -> CsvSessionState {
        self.state
    }

    pub fn statistics(&self) -> &CsvSessionStatistics {
        &self.statistics
    }

    pub fn options(&self) -> &CsvReaderOptions {
        &self.options
    }

    pub fn detected_encoding(&self) -> CsvEncoding {
        self.detected_encoding
    }

    pub fn header_metadata(&self) -> Option<&CsvHeaders> {
        self.headers.as_ref()
    }

    pub fn headers(&self) -> Option<&[String]> {
        self.headers.as_ref().map(CsvHeaders::names)
    }

    pub fn original_headers(&self) -> Option<&[String]> {
        self.headers.as_ref().map(CsvHeaders::original_names)
    }
}

impl CsvSession<File> {
    pub fn from_path(path: impl AsRef<Path>, options: CsvReaderOptions) -> CsvResult<Self> {
        let reader = CsvReader::from_path(path, options)?;

        Ok(Self::from_reader(reader))
    }
}
