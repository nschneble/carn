BEGIN;

INSERT INTO users (id, handle, display_name, email, is_admin, created_at)

VALUES (
  gen_random_uuid(),
  'nschneble',
  'Nick Schneble',
  'nschneble@users.noreply.github.com',
  true,
  now()
);

COMMIT;
