-- Grant admin role to user jadfawaz742@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('f53fd650-b4f4-45ad-8c9b-7568c884cb6b', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;