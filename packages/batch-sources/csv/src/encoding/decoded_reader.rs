use std::io::{self, Chain, Cursor, Read};

use encoding_rs::{UTF_16BE, UTF_16LE, WINDOWS_1252};

use encoding_rs_io::{DecodeReaderBytes, DecodeReaderBytesBuilder};

use crate::contracts::CsvEncoding;
use crate::errors::{CsvError, CsvResult};

use super::detector::CsvEncodingDetector;
use super::strict_decoder::StrictDecoder;

type PrefixedReader<R> = Chain<Cursor<Vec<u8>>, R>;

enum DecodedSource<R: Read> {
    Utf8(PrefixedReader<R>),

    Windows1252(Box<DecodeReaderBytes<PrefixedReader<R>, Vec<u8>>>),

    Utf16(Box<StrictDecoder<PrefixedReader<R>>>),
}

pub struct CsvDecodedReader<R: Read> {
    source: DecodedSource<R>,
    encoding: CsvEncoding,
    bom_length: usize,
}

impl<R: Read> CsvDecodedReader<R> {
    pub fn new(mut source: R, requested: CsvEncoding) -> CsvResult<Self> {
        let prefix = Self::read_prefix(&mut source)?;

        let detection = CsvEncodingDetector::detect(&prefix, requested)?;

        let remaining_prefix = prefix[detection.bom_length..].to_vec();

        let prefixed_source = Cursor::new(remaining_prefix).chain(source);

        let decoded_source = match detection.encoding {
            CsvEncoding::Utf8 => DecodedSource::Utf8(prefixed_source),

            CsvEncoding::Windows1252 => {
                let decoder = DecodeReaderBytesBuilder::new()
                    .encoding(Some(WINDOWS_1252))
                    .bom_sniffing(false)
                    .build(prefixed_source);

                DecodedSource::Windows1252(Box::new(decoder))
            }

            CsvEncoding::Utf16Le => {
                DecodedSource::Utf16(Box::new(StrictDecoder::new(prefixed_source, UTF_16LE)))
            }

            CsvEncoding::Utf16Be => {
                DecodedSource::Utf16(Box::new(StrictDecoder::new(prefixed_source, UTF_16BE)))
            }

            CsvEncoding::Auto => {
                return Err(CsvError::Internal {
                    reason: "Encoding was not resolved".to_string(),
                });
            }
        };

        Ok(Self {
            source: decoded_source,
            encoding: detection.encoding,
            bom_length: detection.bom_length,
        })
    }

    fn read_prefix(source: &mut R) -> io::Result<Vec<u8>> {
        let mut prefix = [0u8; 4];
        let mut total = 0;

        while total < prefix.len() {
            match source.read(&mut prefix[total..]) {
                Ok(0) => break,

                Ok(count) => {
                    total += count;
                }

                Err(error) if error.kind() == io::ErrorKind::Interrupted => {
                    continue;
                }

                Err(error) => return Err(error),
            }
        }

        Ok(prefix[..total].to_vec())
    }

    pub fn encoding(&self) -> CsvEncoding {
        self.encoding
    }

    pub fn bom_length(&self) -> usize {
        self.bom_length
    }

    pub fn has_bom(&self) -> bool {
        self.bom_length > 0
    }
}

impl<R: Read> Read for CsvDecodedReader<R> {
    fn read(&mut self, destination: &mut [u8]) -> io::Result<usize> {
        match &mut self.source {
            DecodedSource::Utf8(source) => source.read(destination),

            DecodedSource::Windows1252(source) => source.read(destination),

            DecodedSource::Utf16(source) => source.read(destination),
        }
    }
}
