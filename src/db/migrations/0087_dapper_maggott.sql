ALTER TABLE "backups" ADD COLUMN "labels" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_backups_labels" ON "backups" USING gin ("labels");