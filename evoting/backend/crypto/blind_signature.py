"""
blind_signature.py — RSA blind signatures (Chaum, 1983).

The election authority needs to certify "this voter is eligible" without
learning what that voter is about to vote for, and without being able to
link the signed ballot back to the voter later. Blind signing achieves this:

  1. Voter picks a random blinding factor r, and sends the authority
     blind(m) = m * r^e mod n   (not m itself)
  2. Authority signs the blinded value with its private key:
     blind_sig = blind(m)^d mod n
  3. Voter removes the blinding factor:
     sig = blind_sig * r^-1 mod n
  4. sig is now a valid RSA signature on the ORIGINAL m — but the authority
     never saw m, so it cannot tie this signature back to this voter later.

This module implements real RSA blind signing on top of PyCryptodome's key
primitives (not a toy simulation).
"""
from Crypto.PublicKey import RSA
from Crypto.Util.number import bytes_to_long, long_to_bytes, GCD
import hashlib
import secrets


class BlindSignatureAuthority:
    """Represents the election authority's signing keypair."""

    def __init__(self, key_size: int = 2048):
        self._key = RSA.generate(key_size)

    @property
    def public_key(self):
        return self._key.publickey()

    @property
    def n(self):
        return self._key.n

    @property
    def e(self):
        return self._key.e

    def sign_blinded(self, blinded_m: int) -> int:
        """Authority signs a blinded message it cannot read. This is the
        ONLY operation the authority performs — it never sees the real
        ballot token."""
        d = self._key.d
        n = self._key.n
        return pow(blinded_m, d, n)

    def verify(self, message: bytes, signature: int) -> bool:
        """Verify an unblinded signature against the original message."""
        n = self._key.n
        e = self._key.e
        h = bytes_to_long(hashlib.sha256(message).digest())
        return pow(signature, e, n) == h % n


class Voter:
    """Client-side blind signature operations performed on the voter's
    behalf (in this prototype, executed server-side on request, mirroring
    the SYSTEM-lane placement of encryption in the project flowchart)."""

    @staticmethod
    def blind(message: bytes, authority_pub) -> tuple:
        """Blind a message before sending it for signing.
        Returns (blinded_int, blinding_factor) — caller must keep the
        blinding factor secret and local; it is never transmitted."""
        n = authority_pub.n
        e = authority_pub.e
        h = bytes_to_long(hashlib.sha256(message).digest()) % n

        while True:
            r = secrets.randbelow(n - 2) + 2
            if GCD(r, n) == 1:
                break

        blinded = (h * pow(r, e, n)) % n
        return blinded, r

    @staticmethod
    def unblind(blind_signature: int, r: int, authority_pub) -> int:
        """Remove the blinding factor to recover a valid signature on the
        original (unblinded) message."""
        n = authority_pub.n
        r_inv = pow(r, -1, n)
        return (blind_signature * r_inv) % n
