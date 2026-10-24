"""
merkle.py — append-only, tamper-evident audit log using a Merkle tree.

Every submitted vote gets hashed into a leaf. Leaves are paired and hashed
upward until a single root hash remains. Changing any single historical
entry changes the root — so publishing the root lets anyone detect tampering
without needing to see the underlying votes.
"""
import hashlib


def _h(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class MerkleLog:
    def __init__(self):
        self.leaves = []  # list of (entry_id, leaf_hash)

    def append(self, entry_id: str, payload: bytes) -> str:
        leaf_hash = _h(payload)
        self.leaves.append((entry_id, leaf_hash))
        return leaf_hash

    def root(self) -> str:
        if not self.leaves:
            return _h(b"")
        level = [h for _, h in self.leaves]
        while len(level) > 1:
            if len(level) % 2 == 1:
                level.append(level[-1])  # duplicate last if odd
            level = [_h((level[i] + level[i + 1]).encode()) for i in range(0, len(level), 2)]
        return level[0]

    def inclusion_proof(self, entry_id: str):
        """Returns the sibling-hash path needed to prove entry_id is
        included, without revealing any other leaf's content."""
        index = next((i for i, (eid, _) in enumerate(self.leaves) if eid == entry_id), None)
        if index is None:
            return None

        level = [h for _, h in self.leaves]
        proof = []
        idx = index
        while len(level) > 1:
            if len(level) % 2 == 1:
                level.append(level[-1])
            sibling_idx = idx + 1 if idx % 2 == 0 else idx - 1
            proof.append(level[sibling_idx])
            level = [_h((level[i] + level[i + 1]).encode()) for i in range(0, len(level), 2)]
            idx //= 2
        return proof

    @staticmethod
    def verify_inclusion(leaf_hash: str, proof: list, root: str, index: int) -> bool:
        current = leaf_hash
        idx = index
        for sibling in proof:
            if idx % 2 == 0:
                current = _h((current + sibling).encode())
            else:
                current = _h((sibling + current).encode())
            idx //= 2
        return current == root
