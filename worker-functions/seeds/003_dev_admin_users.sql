-- Dev seed: admin users para ambiente local.
-- firebase_uid é placeholder — o lookup no MultiAuthService casa por email também.
-- Idempotente via ON CONFLICT.

INSERT INTO users (firebase_uid, email, display_name, role, is_active)
VALUES ('dev-local-gabriel', 'gabriel.g.stein@gmail.com', 'Gabriel Stein', 'admin', true)
ON CONFLICT (email) DO UPDATE SET role = 'admin', is_active = true;
