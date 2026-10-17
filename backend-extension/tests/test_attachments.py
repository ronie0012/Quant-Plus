import asyncio
from io import BytesIO
import sqlite3

import httpx
import pytest

from quantplus_intelligence.news.archive import NewsArchive
from quantplus_intelligence.news.attachments import AttachmentIngestor, MAX_BYTES, allowed_url, parse_isolated

XML = b'''<?xml version="1.0"?><xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:in="https://example.test/in">
<context id="FY"><entity><identifier scheme="ISIN">INE000TEST</identifier></entity><period><instant>2026-03-31</instant></period></context>
<unit id="INR"><measure>INR</measure></unit><in:Revenue contextRef="FY" unitRef="INR" decimals="0">1234</in:Revenue></xbrl>'''
URL = "https://nsearchives.nseindia.com/corporate/report.xml"


def test_official_host_allowlist_rejects_url_tricks():
    assert allowed_url(URL)
    for url in ["http://nsearchives.nseindia.com/a.pdf", "https://127.0.0.1/a.pdf", "https://nsearchives.nseindia.com.evil.test/a.pdf", "https://evil.test@nsearchives.nseindia.com/a.pdf", "https://nsearchives.nseindia.com:8000/a.pdf", "file:///etc/passwd"]:
        assert not allowed_url(url)


def test_isolated_xbrl_preserves_context_units_and_raw_values():
    result = parse_isolated(XML)
    assert result["status"] == "parsed", result
    assert result["untrusted"] is True
    assert result["facts"][0]["raw_value"] == "1234"
    assert result["facts"][0]["context_ref"] == "FY"
    assert result["facts"][0]["unit_ref"] == "INR"
    assert result["contexts"][0]["id"] == "FY"
    assert result["units"][0]["id"] == "INR"


def test_pdf_extracts_actual_text_in_subprocess():
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
    content = DecodedStreamObject()
    content.set_data(b"BT /F1 12 Tf 10 100 Td (Official revenue statement) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(content)
    output = BytesIO()
    writer.write(output)
    result = parse_isolated(output.getvalue())
    assert result["status"] == "parsed", result
    assert "Official revenue statement" in result["text"]


def test_malformed_encrypted_entities_and_oversized_content_fail_closed():
    for raw in [b'<!DOCTYPE x [<!ENTITY x SYSTEM "file:///private">]><x>&x;</x>', b"not a document", b"x" * (MAX_BYTES + 1)]:
        assert parse_isolated(raw)["status"] == "unavailable"


def test_ingestion_conditional_retrieval_and_immutable_versions(tmp_path):
    archive = NewsArchive(tmp_path / "news.sqlite")
    count = [0]
    def handler(request):
        count[0] += 1
        if count[0] == 2:
            assert request.headers["If-None-Match"] == '"version-one"'
            return httpx.Response(304)
        return httpx.Response(200, content=XML if count[0] == 1 else XML.replace(b"1234", b"5678"), headers={"ETag": '"version-one"' if count[0] == 1 else '"version-two"'})
    ingestor = AttachmentIngestor(archive, httpx.MockTransport(handler))
    article = {"provider": "nse_announcements", "attachment_url": URL}
    first = asyncio.run(ingestor.ingest(article))
    second = asyncio.run(ingestor.ingest(article))
    third = asyncio.run(ingestor.ingest(article))
    assert first["status"] == "parsed", first
    assert first["content_hash"] == second["content_hash"]
    assert second["retrieval"] == "not_modified"
    assert second["available_at"] == first["available_at"]
    assert first["content_hash"] != third["content_hash"]
    with sqlite3.connect(archive.path) as db:
        assert db.execute("SELECT COUNT(*) FROM news_attachments").fetchone()[0] == 2
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            db.execute("DELETE FROM news_attachments")


def test_redirects_and_download_bombs_are_unavailable(tmp_path):
    archive = NewsArchive(tmp_path / "news.sqlite")
    article = {"provider": "nse_announcements", "attachment_url": URL}
    for response in [httpx.Response(302, headers={"Location": "https://127.0.0.1/secret"}), httpx.Response(200, headers={"Content-Length": str(MAX_BYTES + 1)})]:
        ingestor = AttachmentIngestor(archive, httpx.MockTransport(lambda request: response))
        assert asyncio.run(ingestor.ingest(article))["status"] == "unavailable"


def test_archive_outage_does_not_take_down_news_analysis(tmp_path, monkeypatch):
    archive = NewsArchive(tmp_path / "news.sqlite")
    def unavailable(url):
        raise sqlite3.OperationalError("disk unavailable")
    monkeypatch.setattr(archive, "latest_attachment", unavailable)
    ingestor = AttachmentIngestor(archive)
    result = asyncio.run(ingestor.ingest({"provider": "nse_announcements", "attachment_url": URL}))
    assert result["status"] == "unavailable"
