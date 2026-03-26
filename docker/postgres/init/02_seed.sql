BEGIN;

INSERT INTO roles (role_name) VALUES
  ('Developer'),
  ('Team Lead'),
  ('Admin'),
  ('Manager'),
  ('QA'),
  ('Senior Developer')
ON CONFLICT DO NOTHING;

INSERT INTO users (user_id, name, email, password_hash, role_id)
SELECT 1, 'Admin User', 'admin@itcompany.com', 'Password123!', role_id
FROM roles
WHERE role_name = 'Admin'
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('users', 'user_id'), (SELECT MAX(user_id) FROM users));
SELECT setval(pg_get_serial_sequence('roles', 'role_id'), (SELECT MAX(role_id) FROM roles));

COMMIT;
