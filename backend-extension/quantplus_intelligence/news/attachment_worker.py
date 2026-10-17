"""Bounded document parser subprocess. No provider keys, network, or active content."""
from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import sys

MAX_BYTES = 6 * 1024 * 1024
MAX_TEXT = 100_000


def restrict_memory():
    limit = 384 * 1024 * 1024
    if os.name != "nt":
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
        return None
    import ctypes as C
    from ctypes import wintypes as W

    class Basic(C.Structure):
        _fields_ = [("process_time", C.c_int64), ("job_time", C.c_int64), ("flags", W.DWORD),
                    ("min_ws", C.c_size_t), ("max_ws", C.c_size_t), ("active", W.DWORD),
                    ("affinity", C.c_size_t), ("priority", W.DWORD), ("scheduling", W.DWORD)]

    class IO(C.Structure):
        _fields_ = [(name, C.c_uint64) for name in ["read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes"]]

    class Extended(C.Structure):
        _fields_ = [("basic", Basic), ("io", IO), ("process_memory", C.c_size_t),
                    ("job_memory", C.c_size_t), ("peak_process", C.c_size_t), ("peak_job", C.c_size_t)]

    kernel = C.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [C.c_void_p, W.LPCWSTR]
    kernel.CreateJobObjectW.restype = W.HANDLE
    kernel.GetCurrentProcess.restype = W.HANDLE
    kernel.SetInformationJobObject.argtypes = [W.HANDLE, C.c_int, C.c_void_p, W.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [W.HANDLE, W.HANDLE]
    handle = kernel.CreateJobObjectW(None, None)
    settings = Extended()
    settings.basic.flags = 0x100 | 0x2000 | 0x8  # process memory, kill on close, one process
    settings.basic.active = 1
    settings.process_memory = limit
    if not handle or not kernel.SetInformationJobObject(handle, 9, C.byref(settings), C.sizeof(settings)) or not kernel.AssignProcessToJobObject(handle, kernel.GetCurrentProcess()):
        raise RuntimeError("Parser memory isolation unavailable")
    return handle  # Keep the job alive for the lifetime of this worker.


def parse_xml(raw):
    from xml.etree import ElementTree as ET
    if b"\x00" in raw or b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise ValueError("XML declarations/entities are not allowed")
    root = ET.fromstring(raw.decode("utf-8-sig"))
    facts, contexts, units, texts = [], [], [], []
    length = 0
    for index, element in enumerate(root.iter()):
        if index >= 20_000:
            raise ValueError("XML element limit exceeded")
        tag = element.tag.rsplit("}", 1)[-1]
        text = " ".join(element.itertext()).strip() if tag in {"context", "unit"} else (element.text or "").strip()
        if tag == "context":
            contexts.append({"id": element.get("id"), "text": text[:2000]})
        elif tag == "unit":
            units.append({"id": element.get("id"), "text": text[:200]})
        if element.get("contextRef"):
            if len(facts) >= 2000:
                raise ValueError("XBRL fact limit exceeded")
            facts.append({"name": element.get("name") or element.tag,
                          "context_ref": element.get("contextRef"), "unit_ref": element.get("unitRef"),
                          "raw_value": text[:2000], "decimals": element.get("decimals"),
                          "scale": element.get("scale"), "sign": element.get("sign")})
        if text:
            length += len(text) + 1
            if length > MAX_TEXT:
                raise ValueError("Extracted text limit exceeded")
            texts.append(text)
    return {"text": "\n".join(texts), "facts": facts, "contexts": contexts, "units": units}


def parse_pdf(raw):
    from io import BytesIO
    from pypdf import PdfReader
    reader = PdfReader(BytesIO(raw), strict=True)
    if reader.is_encrypted:
        raise ValueError("Encrypted PDF is unsupported")
    if len(reader.pages) > 100:
        raise ValueError("PDF page limit exceeded")
    texts = []
    for page in reader.pages:
        content = page.get_contents()
        if content is not None and len(content.get_data()) > 1024 * 1024:
            raise ValueError("PDF content stream limit exceeded")
        text = page.extract_text() or ""
        texts.append(text)
        if sum(len(part) for part in texts) > MAX_TEXT:
            raise ValueError("Extracted text limit exceeded")
    return {"text": "\n".join(texts), "facts": [], "pages": len(texts)}


def main():
    job = restrict_memory()
    def deny(*args, **kwargs):
        raise RuntimeError("Parser network disabled")
    socket.socket = deny
    raw = Path(sys.argv[1]).read_bytes()
    if len(raw) > MAX_BYTES:
        raise ValueError("Attachment size limit exceeded")
    result = parse_pdf(raw) if raw.startswith(b"%PDF-") else parse_xml(raw)
    result.update({"status": "parsed" if result["text"].strip() else "no_extractable_text",
                   "parser_version": "official-attachments-v1", "untrusted": True})
    print(json.dumps(result))
    return job


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "unavailable", "reason": str(error)[:160], "untrusted": True}))
        sys.exit(1)
