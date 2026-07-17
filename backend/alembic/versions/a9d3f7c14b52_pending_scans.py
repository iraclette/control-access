"""pending scans (from the enroller device)

Revision ID: a9d3f7c14b52
Revises: f5c3a8d21e97
Create Date: 2026-07-17 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a9d3f7c14b52'
down_revision = 'f5c3a8d21e97'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pending_scans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("hash", sa.String(), nullable=False, unique=True),
        sa.Column("device_id", sa.String(), sa.ForeignKey("devices.device_id"), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("pending_scans")
