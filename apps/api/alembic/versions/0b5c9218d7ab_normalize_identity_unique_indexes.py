"""Enforce case-insensitive identity uniqueness.

Revision ID: 0b5c9218d7ab
Revises: f1c9a2d6e4b8
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0b5c9218d7ab"
down_revision: Union[str, None] = "f1c9a2d6e4b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEXES = (
    ("uq_teams_code_normalized", "teams", "code"),
    ("uq_sites_code_normalized", "sites", "code"),
    ("uq_employees_employee_code_normalized", "employees", "employee_code"),
    ("uq_employees_email_normalized", "employees", "email"),
    ("uq_users_email_normalized", "users", "email"),
)


def upgrade() -> None:
    # trim() makes accidental leading/trailing whitespace unable to create a
    # second identity; lower() makes NV0001 and nv0001 the same identity.
    for name, table, column in _INDEXES:
        op.execute(
            f"CREATE UNIQUE INDEX {name} ON {table} (lower(trim({column}))) "
            f"WHERE {column} IS NOT NULL AND trim({column}) <> ''"
        )


def downgrade() -> None:
    for name, _table, _column in reversed(_INDEXES):
        op.execute(f"DROP INDEX {name}")
