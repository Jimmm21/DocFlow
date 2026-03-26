import hashlib
import secrets


def hash_password(password: str) -> str:
    salt = secrets.token_hex(8)
    digest = hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_password(stored: str, password: str) -> bool:
    if "$" not in stored:
        return stored == password
    salt, digest = stored.split("$", 1)
    expected = hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()
    return secrets.compare_digest(expected, digest)
