"""buildings + OTA rework

Revision ID: a17f9c2b6d44
Revises: 64453c34a658
Create Date: 2026-07-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a17f9c2b6d44'
down_revision = '64453c34a658'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # ---------- buildings ----------
    op.create_table(
        "buildings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ---------- flats.building_id ----------
    op.add_column("flats", sa.Column("building_id", sa.Integer(), sa.ForeignKey("buildings.id"), nullable=True))
    op.create_index(op.f("ix_flats_building_id"), "flats", ["building_id"])

    # Backfill: parse the "{Building}-{Number}" convention already used in flats.label
    # (e.g. "Gori-103" -> "Gori"). Labels that don't match are left with building_id = NULL
    # so they surface in the admin UI for manual assignment rather than being guessed at.
    name_to_id = {}
    for row in bind.execute(sa.text("SELECT id, label FROM flats")).fetchall():
        label = row.label or ""
        if "-" not in label:
            continue
        prefix = label.split("-", 1)[0].strip()
        if not prefix:
            continue
        if prefix not in name_to_id:
            existing = bind.execute(sa.text("SELECT id FROM buildings WHERE name = :n"), {"n": prefix}).fetchone()
            if existing:
                name_to_id[prefix] = existing.id
            else:
                inserted = bind.execute(
                    sa.text("INSERT INTO buildings (name) VALUES (:n) RETURNING id"), {"n": prefix}
                ).fetchone()
                name_to_id[prefix] = inserted.id
        bind.execute(
            sa.text("UPDATE flats SET building_id = :b WHERE id = :i"),
            {"b": name_to_id[prefix], "i": row.id},
        )

    # ---------- devices ----------
    op.add_column("devices", sa.Column("building_id", sa.Integer(), sa.ForeignKey("buildings.id"), nullable=True))
    op.create_index(op.f("ix_devices_building_id"), "devices", ["building_id"])
    op.add_column("devices", sa.Column("fw_current_version", sa.String(), nullable=True))
    op.drop_column("devices", "fw_target_version")
    op.drop_column("devices", "fw_target_filename")
    op.drop_column("devices", "fw_target_sha256")

    # ---------- firmware_releases rework ----------
    # This table was scaffolded but never written to by any code path, so any existing rows
    # are leftover/incomplete test data rather than real releases.
    op.add_column("firmware_releases", sa.Column("device_type", sa.String(), nullable=True))
    op.execute("UPDATE firmware_releases SET device_type = 'door' WHERE device_type IS NULL")
    op.alter_column("firmware_releases", "device_type", nullable=False)

    op.add_column("firmware_releases", sa.Column("filename", sa.String(), nullable=True))
    op.execute("UPDATE firmware_releases SET filename = url WHERE filename IS NULL")
    op.alter_column("firmware_releases", "filename", nullable=False)
    op.drop_column("firmware_releases", "url")

    # No sensible backfill for a missing hash on a security-relevant field; drop incomplete rows.
    op.execute("DELETE FROM firmware_releases WHERE sha256 IS NULL")
    op.alter_column("firmware_releases", "sha256", nullable=False)

    op.execute("UPDATE firmware_releases SET active = false WHERE active IS NULL")
    op.alter_column("firmware_releases", "active", nullable=False, server_default=sa.false())

    op.alter_column(
        "firmware_releases", "version",
        type_=sa.String(),
        postgresql_using="version::text",
    )

    op.drop_constraint("firmware_releases_version_key", "firmware_releases", type_="unique")
    op.create_unique_constraint(
        "uq_firmware_type_version", "firmware_releases", ["device_type", "version"]
    )


def downgrade():
    op.drop_constraint("uq_firmware_type_version", "firmware_releases", type_="unique")
    op.alter_column(
        "firmware_releases", "version",
        type_=sa.Integer(),
        postgresql_using="version::integer",
    )
    op.create_unique_constraint("firmware_releases_version_key", "firmware_releases", ["version"])

    op.alter_column("firmware_releases", "active", nullable=True, server_default=None)
    op.alter_column("firmware_releases", "sha256", nullable=True)

    op.add_column("firmware_releases", sa.Column("url", sa.String(), nullable=True))
    op.execute("UPDATE firmware_releases SET url = filename")
    op.alter_column("firmware_releases", "url", nullable=False)
    op.drop_column("firmware_releases", "filename")

    op.drop_column("firmware_releases", "device_type")

    op.add_column("devices", sa.Column("fw_target_version", sa.String(), nullable=True))
    op.add_column("devices", sa.Column("fw_target_filename", sa.String(), nullable=True))
    op.add_column("devices", sa.Column("fw_target_sha256", sa.String(), nullable=True))
    op.drop_column("devices", "fw_current_version")
    op.drop_index(op.f("ix_devices_building_id"), table_name="devices")
    op.drop_column("devices", "building_id")

    op.drop_index(op.f("ix_flats_building_id"), table_name="flats")
    op.drop_column("flats", "building_id")

    op.drop_table("buildings")
