use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CsvSessionState {
    Active,
    Completed,
    Cancelled,
    Failed,
    Closed,
}

impl CsvSessionState {
    pub fn is_active(self) -> bool {
        self == Self::Active
    }

    pub fn is_terminal(self) -> bool {
        !self.is_active()
    }
}
