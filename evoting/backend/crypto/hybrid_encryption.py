"""
hybrid_encryption.py — AES-256 (content) + RSA-2048 (key wrapping).

AES is fast and handles the actual vote payload. RSA is slow but lets us
safely hand the AES key to the server without a pre-shared secret — we
only ever encrypt the small 32-byte AES key with RSA, never the vote itself.
"""
from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA
from Crypto.Random import get_random_bytes


class HybridEncryption:
    def __init__(self, rsa_key_size: int = 2048):
        self._server_key = RSA.generate(rsa_key_size)

    @property
    def public_key(self):
        return self._server_key.publickey()

    def encrypt_vote(self, plaintext: bytes) -> dict:
        """Encrypts a vote payload. Returns everything needed to decrypt it
        later, EXCEPT the server's private key."""
        aes_key = get_random_bytes(32)  # AES-256
        cipher_aes = AES.new(aes_key, AES.MODE_GCM)
        ciphertext, tag = cipher_aes.encrypt_and_digest(plaintext)

        # Wrap the AES key with the server's RSA public key.
        cipher_rsa = PKCS1_OAEP.new(self.public_key)
        wrapped_key = cipher_rsa.encrypt(aes_key)

        return {
            "ciphertext": ciphertext,
            "nonce": cipher_aes.nonce,
            "tag": tag,
            "wrapped_key": wrapped_key,
        }

    def decrypt_vote(self, package: dict) -> bytes:
        """Only the holder of the server private key can unwrap the AES key
        and decrypt. Used at tally time / for audit-verified test decryption
        only — normal tallying never calls this per-vote (see paillier_tally.py)."""
        cipher_rsa = PKCS1_OAEP.new(self._server_key)
        aes_key = cipher_rsa.decrypt(package["wrapped_key"])
        cipher_aes = AES.new(aes_key, AES.MODE_GCM, nonce=package["nonce"])
        return cipher_aes.decrypt_and_verify(package["ciphertext"], package["tag"])
