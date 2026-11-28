use std::io::{self, Read};

use encoding_rs::{Decoder, DecoderResult, Encoding};

const BUFFER_SIZE: usize = 8192;

pub(crate) struct StrictDecoder<R: Read> {
    source: R,
    decoder: Decoder,

    input: [u8; BUFFER_SIZE],
    input_start: usize,
    input_end: usize,

    output: [u8; BUFFER_SIZE],
    output_start: usize,
    output_end: usize,

    source_eof: bool,
    finished: bool,
    failed: bool,
}

impl<R: Read> StrictDecoder<R> {
    pub(crate) fn new(source: R, encoding: &'static Encoding) -> Self {
        Self {
            source,
            decoder: encoding.new_decoder_without_bom_handling(),

            input: [0; BUFFER_SIZE],
            input_start: 0,
            input_end: 0,

            output: [0; BUFFER_SIZE],
            output_start: 0,
            output_end: 0,

            source_eof: false,
            finished: false,
            failed: false,
        }
    }

    fn refill_input(&mut self) -> io::Result<()> {
        if self.input_start < self.input_end || self.source_eof {
            return Ok(());
        }

        loop {
            match self.source.read(&mut self.input) {
                Ok(0) => {
                    self.source_eof = true;
                    self.input_start = 0;
                    self.input_end = 0;

                    return Ok(());
                }

                Ok(count) => {
                    self.input_start = 0;
                    self.input_end = count;

                    return Ok(());
                }

                Err(error) if error.kind() == io::ErrorKind::Interrupted => {
                    continue;
                }

                Err(error) => return Err(error),
            }
        }
    }

    fn decode_next(&mut self) -> io::Result<()> {
        self.refill_input()?;

        let (result, consumed, written) = self.decoder.decode_to_utf8_without_replacement(
            &self.input[self.input_start..self.input_end],
            &mut self.output,
            self.source_eof,
        );

        self.input_start += consumed;
        self.output_start = 0;
        self.output_end = written;

        match result {
            DecoderResult::InputEmpty => {
                if self.source_eof {
                    self.finished = true;
                }
            }

            DecoderResult::OutputFull => {}

            DecoderResult::Malformed(_, _) => {
                self.failed = true;
                self.output_start = 0;
                self.output_end = 0;

                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Malformed encoded CSV input",
                ));
            }
        }

        Ok(())
    }
}

impl<R: Read> Read for StrictDecoder<R> {
    fn read(&mut self, destination: &mut [u8]) -> io::Result<usize> {
        if destination.is_empty() {
            return Ok(0);
        }

        if self.failed {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "CSV decoder is in a failed state",
            ));
        }

        loop {
            if self.output_start < self.output_end {
                let available = self.output_end - self.output_start;

                let count = available.min(destination.len());

                destination[..count]
                    .copy_from_slice(&self.output[self.output_start..self.output_start + count]);

                self.output_start += count;

                return Ok(count);
            }

            if self.finished {
                return Ok(0);
            }

            if let Err(error) = self.decode_next() {
                self.failed = true;

                return Err(error);
            }
        }
    }
}
