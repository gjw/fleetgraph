-- Add FleetGraph document types to support findings and agent config.
-- See docs/architecture-who-needs-to-know.md for the notification model.

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'fleetgraph_finding';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'fleetgraph_config';
