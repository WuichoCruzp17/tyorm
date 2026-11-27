use napi_derive::napi;
pub mod contracts;
pub mod errors;
pub mod parser;
pub mod validation;

pub use contracts::*;
pub use errors::*;
pub use parser::*;
pub use validation::*;

#[napi]
pub fn hello_batch_csv() -> String {
    String::from("TyORM Batch CSV Engine")
}

#[napi]
pub fn batch_csv_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_return_engine_name() {
        assert_eq!(hello_batch_csv(), "TyORM Batch CSV Engine");
    }

    #[test]
    fn should_return_engine_version() {
        assert_eq!(batch_csv_version(), env!("CARGO_PKG_VERSION"));
    }
}
