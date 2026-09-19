"""Align RAG message/document content types with ORM metadata.

Revision ID: f1c9a2d6e4b8
Revises: e18c7a920f4b
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1c9a2d6e4b8"
down_revision: Union[str, None] = "e18c7a920f4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch:
        batch.alter_column("content", existing_type=sa.String(length=10000), type_=sa.Text())
    with op.batch_alter_table("rag_documents") as batch:
        batch.alter_column("content", existing_type=sa.String(length=5000), type_=sa.Text())


def downgrade() -> None:
    with op.batch_alter_table("rag_documents") as batch:
        batch.alter_column("content", existing_type=sa.Text(), type_=sa.String(length=5000))
    with op.batch_alter_table("chat_messages") as batch:
        batch.alter_column("content", existing_type=sa.Text(), type_=sa.String(length=10000))
