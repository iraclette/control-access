"""store firmware binary content in the DB

Revision ID: d4b1e9a2c7f3
Revises: a17f9c2b6d44
Create Date: 2026-07-16 18:20:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd4b1e9a2c7f3'
down_revision = 'a17f9c2b6d44'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("firmware_releases", sa.Column("content", sa.LargeBinary(), nullable=True))


def downgrade():
    op.drop_column("firmware_releases", "content")
