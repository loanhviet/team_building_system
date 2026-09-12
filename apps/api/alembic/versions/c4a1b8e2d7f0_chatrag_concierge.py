"""chatrag concierge: knowledge pack, chunks, fts, tool traces

Revision ID: c4a1b8e2d7f0
Revises: 9fb7476fdc24
Create Date: 2026-09-12

Personal-journey blobs leave the vector store (application-side ingest change).
This migration adds the tables the concierge needs: published knowledge docs,
chunk rows, FTS5 keyword index, and chat tool traces.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4a1b8e2d7f0"
down_revision: Union[str, None] = "9fb7476fdc24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body_md", sa.Text(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knowledge_documents_event_id"), "knowledge_documents", ["event_id"])

    op.create_table(
        "rag_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["rag_documents.id"]),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rag_chunks_document_id"), "rag_chunks", ["document_id"])
    op.create_index(op.f("ix_rag_chunks_event_id"), "rag_chunks", ["event_id"])

    with op.batch_alter_table("chat_messages") as batch:
        batch.add_column(sa.Column("tool_trace_json", sa.JSON(), nullable=True))

    op.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
            title,
            content,
            event_id UNINDEXED,
            source_type UNINDEXED,
            tokenize = 'unicode61 remove_diacritics 2'
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rag_chunks_fts")
    with op.batch_alter_table("chat_messages") as batch:
        batch.drop_column("tool_trace_json")
    op.drop_index(op.f("ix_rag_chunks_event_id"), table_name="rag_chunks")
    op.drop_index(op.f("ix_rag_chunks_document_id"), table_name="rag_chunks")
    op.drop_table("rag_chunks")
    op.drop_index(op.f("ix_knowledge_documents_event_id"), table_name="knowledge_documents")
    op.drop_table("knowledge_documents")
