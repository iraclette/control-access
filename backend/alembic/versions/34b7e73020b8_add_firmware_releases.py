"""add firmware releases

Revision ID: 34b7e73020b8
Revises: 0c398b63bb9a
Create Date: 2026-02-08 19:10:39.166294

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '34b7e73020b8'
down_revision = '0c398b63bb9a'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "firmware_releases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False, unique=True),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=True),
        sa.Column("active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

def downgrade():
    op.drop_table("firmware_releases")

