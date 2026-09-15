"""gala turn is_makeup

Revision ID: 7b3f14c9a2e1
Revises: 0a902d04cbd6
Create Date: 2026-09-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b3f14c9a2e1'
down_revision: Union[str, None] = '0a902d04cbd6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("gala_turns") as batch_op:
        batch_op.add_column(
            sa.Column("is_makeup", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("gala_turns") as batch_op:
        batch_op.drop_column("is_makeup")
