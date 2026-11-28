use std::thread;

use tyorm_batch_csv::*;

#[test]
fn should_create_non_cancelled_token() {
    let token = CsvCancellationToken::new();

    assert!(!token.is_cancelled());
}

#[test]
fn should_cancel_token() {
    let token = CsvCancellationToken::new();

    token.cancel();

    assert!(token.is_cancelled());
}

#[test]
fn should_share_cancellation_with_clones() {
    let token = CsvCancellationToken::new();

    let cloned = token.clone();

    cloned.cancel();

    assert!(token.is_cancelled());
    assert!(cloned.is_cancelled());
}

#[test]
fn should_allow_repeated_cancellation() {
    let token = CsvCancellationToken::new();

    token.cancel();
    token.cancel();

    assert!(token.is_cancelled());
}

#[test]
fn should_share_cancellation_across_threads() {
    let token = CsvCancellationToken::new();

    let cloned = token.clone();

    thread::spawn(move || {
        cloned.cancel();
    })
    .join()
    .unwrap();

    assert!(token.is_cancelled());
}
