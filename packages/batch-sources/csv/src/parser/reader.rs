use std::fs::File;
use std::io::Read;
use std::path::Path;

use csv::{Reader, ReaderBuilder, StringRecord};

use crate::errors::{CsvError, CsvResult};

use crate::contracts::{
    CsvEncoding, CsvHeaders, CsvPosition, CsvReaderOptions, CsvTrim, RawBatchRecord,
};

use super::header_resolver::CsvHeaderResolver;

use crate::encoding::CsvDecodedReader;

pub struct CsvReader<R: Read> {
    reader: Reader<CsvDecodedReader<R>>,
    options: CsvReaderOptions,
    headers: Option<CsvHeaders>,
    buffer: StringRecord,
    records_read: u64,
    next_line: u64,
    finished: bool,
    failed: bool,
}

impl<R: Read> CsvReader<R> {
    pub fn new(source: R, options: CsvReaderOptions) -> CsvResult<Self> {
        options.validate()?;

        Self::validate_supported_options(&options)?;

        let decoded_source = CsvDecodedReader::new(source, options.encoding)?;

        let reader = ReaderBuilder::new()
            .delimiter(options.delimiter)
            .quote(options.quote)
            .escape(options.escape)
            .double_quote(options.double_quote)
            .has_headers(false)
            .flexible(true)
            .from_reader(decoded_source);

        let mut instance = Self {
            reader,
            options,
            headers: None,
            buffer: StringRecord::new(),
            records_read: 0,
            next_line: 1,
            finished: false,
            failed: false,
        };

        instance.initialize()?;

        Ok(instance)
    }

    fn validate_supported_options(options: &CsvReaderOptions) -> CsvResult<()> {
        if options.trim != CsvTrim::None {
            return Err(CsvError::InvalidOption {
                field: "trim",
                reason: "Normalization is not implemented yet".to_string(),
            });
        }

        Ok(())
    }

    fn initialize(&mut self) -> CsvResult<()> {
        if !self.options.has_headers {
            return Ok(());
        }

        if self.reader.read_record(&mut self.buffer)? {
            let embedded_line_breaks = Self::count_embedded_line_breaks(&self.buffer);

            self.next_line += embedded_line_breaks + 1;

            let names: Vec<String> = self.buffer.iter().map(str::to_owned).collect();

            self.headers = Some(CsvHeaderResolver::resolve(names, &self.options)?);
        } else {
            self.finished = true;
        }

        Ok(())
    }

    pub fn next_record(&mut self) -> CsvResult<Option<RawBatchRecord>> {
        if self.failed {
            return Err(CsvError::SessionClosed);
        }

        if self.finished {
            return Ok(None);
        }

        match self.reader.read_record(&mut self.buffer) {
            Ok(true) => match self.create_record() {
                Ok(record) => Ok(Some(record)),
                Err(error) => {
                    self.failed = true;
                    Err(error)
                }
            },

            Ok(false) => {
                self.finished = true;
                Ok(None)
            }

            Err(error) => {
                self.failed = true;
                Err(error.into())
            }
        }
    }

    fn create_record(&mut self) -> CsvResult<RawBatchRecord> {
        let position = self.buffer.position().ok_or_else(|| CsvError::Internal {
            reason: "CSV record position is unavailable".to_string(),
        })?;

        let byte_offset = position.byte();

        let line_start = self.next_line;

        let embedded_line_breaks = Self::count_embedded_line_breaks(&self.buffer);

        let line_end = line_start + embedded_line_breaks;

        self.next_line = line_end + 1;

        self.records_read += 1;

        Ok(RawBatchRecord {
            position: CsvPosition {
                record_number: self.records_read,
                line_start,
                line_end,
                byte_offset,
            },
            values: self.buffer.iter().map(str::to_owned).collect(),
            anomalies: Vec::new(),
        })
    }

    fn count_embedded_line_breaks(record: &StringRecord) -> u64 {
        record
            .iter()
            .map(|field| field.bytes().filter(|byte| *byte == b'\n').count() as u64)
            .sum()
    }

    pub fn headers(&self) -> Option<&[String]> {
        self.headers.as_ref().map(CsvHeaders::names)
    }

    pub fn header_metadata(&self) -> Option<&CsvHeaders> {
        self.headers.as_ref()
    }

    pub fn column_index(&self, name: &str) -> Option<usize> {
        self.headers
            .as_ref()
            .and_then(|headers| headers.get_index(name))
    }

    pub fn column_name(&self, index: usize) -> Option<&str> {
        self.headers
            .as_ref()
            .and_then(|headers| headers.get_name(index))
    }

    pub fn column_count(&self) -> Option<usize> {
        self.headers.as_ref().map(CsvHeaders::len)
    }

    pub fn has_column(&self, name: &str) -> bool {
        self.column_index(name).is_some()
    }

    pub fn options(&self) -> &CsvReaderOptions {
        &self.options
    }

    pub fn records_read(&self) -> u64 {
        self.records_read
    }

    pub fn is_finished(&self) -> bool {
        self.finished
    }

    pub fn is_failed(&self) -> bool {
        self.failed
    }

    pub fn detected_encoding(&self) -> CsvEncoding {
        self.reader.get_ref().encoding()
    }

    pub fn has_bom(&self) -> bool {
        self.reader.get_ref().has_bom()
    }

    pub fn bom_length(&self) -> usize {
        self.reader.get_ref().bom_length()
    }
}

impl CsvReader<File> {
    pub fn from_path(path: impl AsRef<Path>, options: CsvReaderOptions) -> CsvResult<Self> {
        options.validate()?;

        Self::validate_supported_options(&options)?;

        let file = File::open(path)?;

        Self::new(file, options)
    }
}
