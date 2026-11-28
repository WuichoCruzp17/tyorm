use crate::contracts::CsvEncoding;
use crate::errors::{CsvError, CsvResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CsvEncodingDetection {
    pub encoding: CsvEncoding,
    pub bom_length: usize,
}

pub struct CsvEncodingDetector;

impl CsvEncodingDetector {
    pub fn detect(prefix: &[u8], requested: CsvEncoding) -> CsvResult<CsvEncodingDetection> {
        if prefix.starts_with(&[0xFF, 0xFE, 0x00, 0x00]) {
            return Err(CsvError::UnsupportedEncoding {
                encoding: "UTF-32 LE".to_string(),
            });
        }

        if prefix.starts_with(&[0x00, 0x00, 0xFE, 0xFF]) {
            return Err(CsvError::UnsupportedEncoding {
                encoding: "UTF-32 BE".to_string(),
            });
        }

        let detected = Self::detect_bom(prefix);

        match detected {
            Some(detection) => {
                if requested != CsvEncoding::Auto && requested != detection.encoding {
                    return Err(CsvError::EncodingMismatch {
                        requested,
                        detected: detection.encoding,
                    });
                }

                Ok(detection)
            }

            None => {
                let encoding = match requested {
                    CsvEncoding::Auto => CsvEncoding::Utf8,
                    encoding => encoding,
                };

                Ok(CsvEncodingDetection {
                    encoding,
                    bom_length: 0,
                })
            }
        }
    }

    fn detect_bom(prefix: &[u8]) -> Option<CsvEncodingDetection> {
        if prefix.starts_with(&[0xEF, 0xBB, 0xBF]) {
            return Some(CsvEncodingDetection {
                encoding: CsvEncoding::Utf8,
                bom_length: 3,
            });
        }

        if prefix.starts_with(&[0xFF, 0xFE]) {
            return Some(CsvEncodingDetection {
                encoding: CsvEncoding::Utf16Le,
                bom_length: 2,
            });
        }

        if prefix.starts_with(&[0xFE, 0xFF]) {
            return Some(CsvEncodingDetection {
                encoding: CsvEncoding::Utf16Be,
                bom_length: 2,
            });
        }

        None
    }
}
