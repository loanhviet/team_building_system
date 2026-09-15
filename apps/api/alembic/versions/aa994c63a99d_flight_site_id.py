"""flight site_id

Revision ID: aa994c63a99d
Revises: c4a1b8e2d7f0
Create Date: 2026-09-15 12:57:56.542178

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa994c63a99d'
down_revision: Union[str, None] = 'c4a1b8e2d7f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("flights") as batch_op:
        batch_op.add_column(sa.Column("site_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_flights_site_id_sites", "sites", ["site_id"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("flights") as batch_op:
        batch_op.drop_constraint("fk_flights_site_id_sites", type_="foreignkey")
        batch_op.drop_column("site_id")
