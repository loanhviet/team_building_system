"""pickup point kind: workplace or venue

Revision ID: c3d8e1a04b21
Revises: 0b5c9218d7ab
Create Date: 2026-09-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d8e1a04b21"
down_revision: Union[str, None] = "0b5c9218d7ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pickup_points") as batch_op:
        batch_op.add_column(
            sa.Column("kind", sa.String(length=20), nullable=False, server_default="workplace")
        )
    op.execute("UPDATE pickup_points SET kind = 'venue' WHERE site_id IS NULL")


def downgrade() -> None:
    with op.batch_alter_table("pickup_points") as batch_op:
        batch_op.drop_column("kind")
