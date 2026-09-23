"""gala turn is_admin_grant

Revision ID: d5e2b7c91a04
Revises: c3d8e1a04b21
Create Date: 2026-09-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5e2b7c91a04"
down_revision: Union[str, None] = "c3d8e1a04b21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("gala_turns") as batch_op:
        batch_op.add_column(
            sa.Column("is_admin_grant", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("gala_turns") as batch_op:
        batch_op.drop_column("is_admin_grant")
