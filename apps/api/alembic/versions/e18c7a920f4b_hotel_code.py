"""add stable hotel code for unambiguous room imports

Revision ID: e18c7a920f4b
Revises: 7b3f14c9a2e1
Create Date: 2026-09-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e18c7a920f4b"
down_revision: str | None = "7b3f14c9a2e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("hotels") as batch_op:
        batch_op.add_column(sa.Column("code", sa.String(length=30), nullable=True))

    connection = op.get_bind()
    hotels = connection.execute(sa.text("SELECT id FROM hotels ORDER BY id")).fetchall()
    for (hotel_id,) in hotels:
        connection.execute(
            sa.text("UPDATE hotels SET code = :code WHERE id = :id"),
            {"code": f"HTL-{hotel_id}", "id": hotel_id},
        )

    with op.batch_alter_table("hotels") as batch_op:
        batch_op.alter_column("code", existing_type=sa.String(length=30), nullable=False)
        batch_op.create_unique_constraint("uq_hotel_event_code", ["event_id", "code"])


def downgrade() -> None:
    with op.batch_alter_table("hotels") as batch_op:
        batch_op.drop_constraint("uq_hotel_event_code", type_="unique")
        batch_op.drop_column("code")
