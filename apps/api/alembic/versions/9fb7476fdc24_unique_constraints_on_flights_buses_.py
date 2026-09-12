"""unique constraints on flights, buses, rooms, gala_tables

Revision ID: 9fb7476fdc24
Revises: a909d3c6de7c
Create Date: 2026-09-12 10:11:34.303448

R1 of docs/REBUILD-PLAN.md: without these, re-running an import (e.g. the
flights import endpoint) silently duplicates every row instead of erroring or
upserting. Before adding each constraint we clean up any pre-existing
violation so `alembic upgrade head` doesn't fail on a real deployment's data
— for flights/buses/rooms that means keeping the earliest row and remapping
child assignments onto it (no rows are silently dropped from a person's
journey); for gala_tables (where "merging" would mean reconciling two sets of
live seats) we just rename the later duplicate's code instead of deleting it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9fb7476fdc24'
down_revision: Union[str, None] = 'a909d3c6de7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- dedupe before constraining ---
    op.execute("""
        UPDATE flight_assignments
        SET flight_id = (
            SELECT MIN(f2.id) FROM flights f2
            JOIN flights f1 ON f1.id = flight_assignments.flight_id
            WHERE f2.event_id = f1.event_id AND f2.flight_code = f1.flight_code
        )
        WHERE flight_id IN (
            SELECT id FROM flights
            WHERE id NOT IN (SELECT MIN(id) FROM flights GROUP BY event_id, flight_code)
        )
    """)
    op.execute("""
        DELETE FROM flights
        WHERE id NOT IN (SELECT MIN(id) FROM flights GROUP BY event_id, flight_code)
    """)

    op.execute("""
        UPDATE bus_assignments
        SET bus_id = (
            SELECT MIN(b2.id) FROM buses b2
            JOIN buses b1 ON b1.id = bus_assignments.bus_id
            WHERE b2.event_id = b1.event_id AND b2.leg_id = b1.leg_id AND b2.code = b1.code
        )
        WHERE bus_id IN (
            SELECT id FROM buses
            WHERE id NOT IN (SELECT MIN(id) FROM buses GROUP BY event_id, leg_id, code)
        )
    """)
    op.execute("""
        DELETE FROM buses
        WHERE id NOT IN (SELECT MIN(id) FROM buses GROUP BY event_id, leg_id, code)
    """)

    op.execute("""
        UPDATE room_assignments
        SET room_id = (
            SELECT MIN(r2.id) FROM rooms r2
            JOIN rooms r1 ON r1.id = room_assignments.room_id
            WHERE r2.hotel_id = r1.hotel_id AND r2.room_number = r1.room_number
        )
        WHERE room_id IN (
            SELECT id FROM rooms
            WHERE id NOT IN (SELECT MIN(id) FROM rooms GROUP BY hotel_id, room_number)
        )
    """)
    op.execute("""
        DELETE FROM rooms
        WHERE id NOT IN (SELECT MIN(id) FROM rooms GROUP BY hotel_id, room_number)
    """)

    # gala_tables: rename instead of delete — merging would mean reconciling
    # two tables' worth of live gala_seats (some possibly already confirmed).
    op.execute("""
        UPDATE gala_tables
        SET code = code || '-dup-' || id
        WHERE id NOT IN (SELECT MIN(id) FROM gala_tables GROUP BY event_id, code)
    """)

    # SQLite can't ALTER a table to add a constraint directly — batch mode
    # does the copy-and-move dance for us (auto-generated as plain
    # create_unique_constraint calls, which fail under sqlite; wrapped here).
    with op.batch_alter_table('buses') as batch_op:
        batch_op.create_unique_constraint('uq_bus_event_leg_code', ['event_id', 'leg_id', 'code'])
    with op.batch_alter_table('flights') as batch_op:
        batch_op.create_unique_constraint('uq_flight_event_code', ['event_id', 'flight_code'])
    with op.batch_alter_table('gala_tables') as batch_op:
        batch_op.create_unique_constraint('uq_gala_table_event_code', ['event_id', 'code'])
    with op.batch_alter_table('rooms') as batch_op:
        batch_op.create_unique_constraint('uq_room_hotel_number', ['hotel_id', 'room_number'])


def downgrade() -> None:
    with op.batch_alter_table('rooms') as batch_op:
        batch_op.drop_constraint('uq_room_hotel_number', type_='unique')
    with op.batch_alter_table('gala_tables') as batch_op:
        batch_op.drop_constraint('uq_gala_table_event_code', type_='unique')
    with op.batch_alter_table('flights') as batch_op:
        batch_op.drop_constraint('uq_flight_event_code', type_='unique')
    with op.batch_alter_table('buses') as batch_op:
        batch_op.drop_constraint('uq_bus_event_leg_code', type_='unique')
