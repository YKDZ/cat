def utf16_offsets(text: str) -> list[int]:
    """Build a code-point to JS/DOM UTF-16 offset table in one pass."""
    offsets = [0]
    for character in text:
        offsets.append(offsets[-1] + (2 if ord(character) > 0xFFFF else 1))
    return offsets
