from __future__ import annotations


def validate_batch_item_ids(item_ids: list[str]) -> None:
    """Enforce the batch shape before work can enter the single worker slot."""
    if not item_ids:
        raise ValueError("Language analysis batches require at least one item.")
    if len(set(item_ids)) != len(item_ids):
        raise ValueError("Language analysis batch item IDs must be unique.")
