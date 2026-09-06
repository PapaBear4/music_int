#!/usr/bin/env python3
"""
Source Manager for Multi-Source Music Ingestion.
Tracks uploaded source files, computes SHA-256 hashes, classifies file types,
and maintains an immutable manifest for incremental refinement.
"""

import os
import hashlib
from typing import Dict, List, Any, Optional


def compute_sha256(data: bytes) -> str:
    """Computes standard SHA-256 hex digest for binary data."""
    return hashlib.sha256(data).hexdigest()


def classify_file_type(filename: str, header_bytes: bytes = b"") -> str:
    """
    Classifies the music file type based on extension and magic bytes.
    Returns one of: 'guitar_pro', 'chord_sheet_pdf', 'vocal_score_pdf', 'piano_score_pdf',
    'score_pdf', 'chordpro', 'musicxml', 'midi', 'text', 'unknown'.
    """
    name_lower = filename.lower()
    
    if name_lower.endswith((".gp", ".gpx", ".gp5", ".gp4", ".gp3", ".gpif")):
        return "guitar_pro"
    if name_lower.endswith((".chordpro", ".pro", ".cho", ".crd")):
        return "chordpro"
    if name_lower.endswith((".xml", ".musicxml", ".mxl")):
        return "musicxml"
    if name_lower.endswith((".mid", ".midi")):
        return "midi"
    if name_lower.endswith(".pdf"):
        if "chord" in name_lower or "lead" in name_lower or "chart" in name_lower:
            return "chord_sheet_pdf"
        if "vocal" in name_lower or "melody" in name_lower or "sing" in name_lower:
            return "vocal_score_pdf"
        if "piano" in name_lower or "acc" in name_lower or "keys" in name_lower:
            return "piano_score_pdf"
        return "score_pdf"
    if name_lower.endswith(".txt"):
        return "text"
    
    return "unknown"


class SourceDocument:
    """Represents a single registered source file."""
    def __init__(
        self,
        source_id: str,
        filename: str,
        file_type: str,
        data: bytes,
        parsed_ast: Optional[Dict[str, Any]] = None,
        role: str = "supplemental"
    ):
        self.source_id = source_id
        self.filename = filename
        self.file_type = file_type
        self.data = data
        self.size_bytes = len(data)
        self.sha256 = compute_sha256(data)
        self.parsed_ast = parsed_ast or {}
        self.role = role  # 'primary_rhythm', 'harmonic_lead', 'vocal_melody', 'accompaniment', 'supplemental'

    def to_manifest_entry(self, include_raw: bool = False) -> Dict[str, Any]:
        """Serializes source descriptor for the UMS document manifest."""
        entry = {
            "source_id": self.source_id,
            "filename": self.filename,
            "file_type": self.file_type,
            "role": self.role,
            "size_bytes": self.size_bytes,
            "sha256": self.sha256
        }
        if include_raw:
            import base64
            entry["raw_base64"] = base64.b64encode(self.data).decode("utf-8")
        return entry


class SourceManager:
    """
    Manages collection of source documents for a song,
    supporting iterative additions and role assignment.
    """
    def __init__(self):
        self.sources: Dict[str, SourceDocument] = {}
        self.primary_rhythm_source_id: Optional[str] = None

    def add_source(
        self,
        filename: str,
        data: bytes,
        parsed_ast: Optional[Dict[str, Any]] = None,
        role_override: Optional[str] = None
    ) -> SourceDocument:
        """Registers a new source file or updates existing one based on hash."""
        digest = compute_sha256(data)
        file_type = classify_file_type(filename, data[:32])

        # Check if already registered
        for s in self.sources.values():
            if s.sha256 == digest:
                if parsed_ast:
                    s.parsed_ast = parsed_ast
                return s

        source_id = f"src_{len(self.sources) + 1}_{file_type}"
        
        # Determine role
        if role_override:
            role = role_override
        elif file_type == "guitar_pro" or file_type == "musicxml":
            role = "primary_rhythm" if not self.primary_rhythm_source_id else "supplemental"
        elif file_type == "chord_sheet_pdf" or file_type == "chordpro":
            role = "harmonic_lead"
        elif file_type == "vocal_score_pdf":
            role = "vocal_melody"
        elif file_type == "piano_score_pdf":
            role = "accompaniment"
        else:
            role = "supplemental"

        doc = SourceDocument(
            source_id=source_id,
            filename=filename,
            file_type=file_type,
            data=data,
            parsed_ast=parsed_ast,
            role=role
        )
        self.sources[source_id] = doc

        if role == "primary_rhythm" and not self.primary_rhythm_source_id:
            self.primary_rhythm_source_id = source_id

        return doc

    def add_source_from_file(
        self,
        file_path: str,
        parsed_ast: Optional[Dict[str, Any]] = None,
        role_override: Optional[str] = None
    ) -> SourceDocument:
        """Helper to read from local disk."""
        with open(file_path, "rb") as f:
            data = f.read()
        return self.add_source(os.path.basename(file_path), data, parsed_ast, role_override)

    def get_source(self, source_id: str) -> Optional[SourceDocument]:
        return self.sources.get(source_id)

    def get_primary_rhythm_source(self) -> Optional[SourceDocument]:
        if self.primary_rhythm_source_id and self.primary_rhythm_source_id in self.sources:
            return self.sources[self.primary_rhythm_source_id]
        for s in self.sources.values():
            if s.file_type in ("guitar_pro", "musicxml", "midi"):
                return s
        return None

    def get_sources_by_role(self, role: str) -> List[SourceDocument]:
        return [s for s in self.sources.values() if s.role == role]

    def clear(self) -> None:
        self.sources.clear()
        self.primary_rhythm_source_id = None

    def to_manifest(self, include_raw: bool = False) -> List[Dict[str, Any]]:
        return [s.to_manifest_entry(include_raw=include_raw) for s in self.sources.values()]

