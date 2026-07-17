"""rfid tags (many per flat)

Revision ID: f5c3a8d21e97
Revises: e8f2a4c19b6d
Create Date: 2026-07-17 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f5c3a8d21e97'
down_revision = 'e8f2a4c19b6d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rfid_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("flat_id", sa.Integer(), sa.ForeignKey("flats.id"), nullable=False),
        sa.Column("hash", sa.String(), nullable=False, unique=True),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_rfid_tags_flat_id", "rfid_tags", ["flat_id"])


def downgrade():
    op.drop_index("ix_rfid_tags_flat_id", table_name="rfid_tags")
    op.drop_table("rfid_tags")
