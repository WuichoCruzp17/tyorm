use crate::contracts::CsvReaderOptions;
use crate::errors::{CsvError, CsvResult};

pub struct CsvOptionsValidator;

impl CsvOptionsValidator {
    pub fn validate(options: &CsvReaderOptions) -> CsvResult<()> {
        Self::validate_characters(options)?;
        Self::validate_limits(options)?;

        Ok(())
    }

    fn validate_characters(options: &CsvReaderOptions) -> CsvResult<()> {
        Self::validate_character("delimiter", options.delimiter)?;

        Self::validate_character("quote", options.quote)?;

        if options.delimiter == options.quote {
            return Err(Self::invalid(
                "delimiter",
                "Delimiter and quote must be different",
            ));
        }

        if let Some(escape) = options.escape {
            Self::validate_character("escape", escape)?;

            if escape == options.delimiter {
                return Err(Self::invalid(
                    "escape",
                    "Escape and delimiter must be different",
                ));
            }

            if escape == options.quote {
                return Err(Self::invalid(
                    "escape",
                    "Escape and quote must be different",
                ));
            }
        }

        Ok(())
    }

    fn validate_character(field: &'static str, value: u8) -> CsvResult<()> {
        if !value.is_ascii() || value == b'\0' || value == b'\r' || value == b'\n' {
            return Err(Self::invalid(
                field,
                "Must be a valid ASCII character, excluding NUL, CR and LF",
            ));
        }

        Ok(())
    }

    fn validate_limits(options: &CsvReaderOptions) -> CsvResult<()> {
        let limits = [
            ("chunk_size", options.chunk_size),
            ("max_columns", options.max_columns),
            ("max_field_bytes", options.max_field_bytes),
            ("max_record_bytes", options.max_record_bytes),
            ("max_chunk_bytes", options.max_chunk_bytes),
        ];

        for (field, value) in limits {
            if value == 0 {
                return Err(Self::invalid(field, "Must be greater than zero"));
            }
        }

        if options.max_field_bytes > options.max_record_bytes {
            return Err(Self::invalid(
                "max_field_bytes",
                "Cannot exceed max_record_bytes",
            ));
        }

        if options.max_record_bytes > options.max_chunk_bytes {
            return Err(Self::invalid(
                "max_record_bytes",
                "Cannot exceed max_chunk_bytes",
            ));
        }

        Ok(())
    }

    fn invalid(field: &'static str, reason: impl Into<String>) -> CsvError {
        CsvError::InvalidOption {
            field,
            reason: reason.into(),
        }
    }
}
