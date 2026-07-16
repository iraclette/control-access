"""per-building elevator PIN toggle

Revision ID: e8f2a4c19b6d
Revises: d4b1e9a2c7f3
Create Date: 2026-07-16 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e8f2a4c19b6d'
down_revision = 'd4b1e9a2c7f3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "buildings",
        sa.Column("elevator_pin_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade():
    op.drop_column("buildings", "elevator_pin_enabled")
