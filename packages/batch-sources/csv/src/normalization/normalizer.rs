use crate::contracts::CsvTrim;

pub struct CsvNormalizer;

impl CsvNormalizer {
    pub fn normalize_headers(headers: &mut [String], trim: CsvTrim) -> usize {
        if !trim.trims_headers() {
            return 0;
        }

        Self::normalize_values(headers)
    }

    pub fn normalize_fields(fields: &mut [String], trim: CsvTrim) -> usize {
        if !trim.trims_fields() {
            return 0;
        }

        Self::normalize_values(fields)
    }

    fn normalize_values(values: &mut [String]) -> usize {
        let mut modified = 0;

        for value in values {
            if Self::trim_in_place(value) {
                modified += 1;
            }
        }

        modified
    }

    fn trim_in_place(value: &mut String) -> bool {
        let original_length = value.len();

        let trimmed_length = value.trim().len();

        if original_length == trimmed_length {
            return false;
        }

        if trimmed_length == 0 {
            value.clear();

            return true;
        }

        let start = original_length - value.trim_start().len();

        let end = start + trimmed_length;

        value.truncate(end);

        if start > 0 {
            value.drain(..start);
        }

        true
    }
}
