# Dictionary engine fuzzing

Install `cargo-fuzz`, then run each boundary independently:

```bash
cargo fuzz run header
cargo fuzz run key-blocks
cargo fuzz run record-blocks
```

The targets intentionally call only safe Rust entry points. A crash, panic, out-of-bounds read, or
allocator failure is a bug; malformed input must return a stable engine error.
