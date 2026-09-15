"""transport leg flight_timing

Revision ID: 0a902d04cbd6
Revises: aa994c63a99d
Create Date: 2026-09-15 13:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0a902d04cbd6'
down_revision: Union[str, None] = 'aa994c63a99d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("transport_legs") as batch_op:
        batch_op.add_column(sa.Column("flight_timing", sa.String(length=20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("transport_legs") as batch_op:
        batch_op.drop_column("flight_timing")
