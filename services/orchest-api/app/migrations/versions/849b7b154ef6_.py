"""Add InteractiveSessionEvent model and event types

Revision ID: 849b7b154ef6
Revises: ad0b4cda3e50
Create Date: 2022-05-13 14:35:48.413549

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "849b7b154ef6"
down_revision = "ad0b4cda3e50"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        INSERT INTO event_types (name) values
        ('project:interactive-session:started'),
        ('project:interactive-session:stopped'),
        ('project:interactive-session:service-restarted'),
        ('project:interactive-session:failed'),
        ('project:interactive-session:succeeded')
        ;
        """
    )
    op.add_column(
        "events", sa.Column("pipeline_uuid", sa.String(length=36), nullable=True)
    )
    op.create_foreign_key(
        op.f("fk_events_project_uuid_pipeline_uuid_interactive_sessions"),
        "events",
        "interactive_sessions",
        ["project_uuid", "pipeline_uuid"],
        ["project_uuid", "pipeline_uuid"],
        ondelete="CASCADE",
    )


def downgrade():
    op.drop_constraint(
        op.f("fk_events_project_uuid_pipeline_uuid_interactive_sessions"),
        "events",
        type_="foreignkey",
    )
    op.drop_column("events", "pipeline_uuid")
