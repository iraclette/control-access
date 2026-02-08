"""device ota fields

Revision ID: 0c398b63bb9a
Revises: e3bfcd0c19f5
Create Date: 2026-02-08 18:32:04.965825

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0c398b63bb9a'
down_revision = 'e3bfcd0c19f5'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("devices", sa.Column("device_type", sa.String(), nullable=True))
    op.add_column("devices", sa.Column("fw_target_version", sa.String(), nullable=True))
    op.add_column("devices", sa.Column("fw_target_filename", sa.String(), nullable=True))
    op.add_column("devices", sa.Column("fw_target_sha256", sa.String(), nullable=True))
    op.add_column("devices", sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False))


def downgrade() -> None:
    pass
