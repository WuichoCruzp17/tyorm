use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CsvHeaders {
    names: Vec<String>,
    indexes: HashMap<String, usize>,
}

impl CsvHeaders {
    pub(crate) fn new(names: Vec<String>, indexes: HashMap<String, usize>) -> Self {
        Self { names, indexes }
    }

    pub fn names(&self) -> &[String] {
        &self.names
    }

    pub fn len(&self) -> usize {
        self.names.len()
    }

    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }

    pub fn get_index(&self, name: &str) -> Option<usize> {
        self.indexes.get(name).copied()
    }

    pub fn get_name(&self, index: usize) -> Option<&str> {
        self.names.get(index).map(String::as_str)
    }

    pub fn contains(&self, name: &str) -> bool {
        self.indexes.contains_key(name)
    }

    pub fn iter(&self) -> impl Iterator<Item = (usize, &str)> + '_ {
        self.names
            .iter()
            .enumerate()
            .map(|(index, name)| (index, name.as_str()))
    }
}
