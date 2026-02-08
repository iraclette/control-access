"""add unlock_ms to device

Revision ID: 64453c34a658
Revises: 000e22b009c1
Create Date: 2026-02-08 23:17:24.453111

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '64453c34a658'
down_revision = '000e22b009c1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("devices", sa.Column("unlock_ms", sa.Integer(), server_default="800", nullable=False))
    op.alter_column("devices", "unlock_ms", server_default=None)

def downgrade():
    op.drop_column("devices", "unlock_ms")

