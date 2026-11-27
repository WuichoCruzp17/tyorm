use std::collections::HashMap;

use crate::contracts::{CsvHeaders, CsvReaderOptions};

use crate::errors::{CsvError, CsvResult};

pub struct CsvHeaderResolver;

impl CsvHeaderResolver {
    pub fn resolve(names: Vec<String>, options: &CsvReaderOptions) -> CsvResult<CsvHeaders> {
        options.validate()?;

        Self::validate_limits(&names, options)?;

        let mut indexes = HashMap::with_capacity(names.len());

        for (index, name) in names.iter().enumerate() {
            Self::validate_name(name, index)?;

            if let Some(previous_index) = indexes.insert(name.clone(), index) {
                return Err(CsvError::InvalidHeaders {
                    reason: format!(
                        "Duplicate header '{name}' at columns \
                         {previous_index} and {index}"
                    ),
                });
            }
        }

        Ok(CsvHeaders::new(names, indexes))
    }

    fn validate_name(name: &str, index: usize) -> CsvResult<()> {
        if name.trim().is_empty() {
            return Err(CsvError::InvalidHeaders {
                reason: format!("Empty header at column {index}"),
            });
        }

        if name.chars().any(char::is_control) {
            return Err(CsvError::InvalidHeaders {
                reason: format!("Control character in header at column {index}"),
            });
        }

        Ok(())
    }

    fn validate_limits(names: &[String], options: &CsvReaderOptions) -> CsvResult<()> {
        if names.is_empty() {
            return Err(CsvError::InvalidHeaders {
                reason: "No headers provided".to_string(),
            });
        }

        if names.len() > options.max_columns {
            return Err(CsvError::ResourceLimitExceeded {
                resource: "header_columns",
                limit: options.max_columns,
                actual: names.len(),
            });
        }

        let mut total_bytes = 0usize;

        for name in names {
            let field_bytes = name.len();

            if field_bytes > options.max_field_bytes {
                return Err(CsvError::ResourceLimitExceeded {
                    resource: "header_field_bytes",
                    limit: options.max_field_bytes,
                    actual: field_bytes,
                });
            }

            total_bytes = total_bytes.saturating_add(field_bytes);
        }

        if total_bytes > options.max_record_bytes {
            return Err(CsvError::ResourceLimitExceeded {
                resource: "header_record_bytes",
                limit: options.max_record_bytes,
                actual: total_bytes,
            });
        }

        Ok(())
    }
}
