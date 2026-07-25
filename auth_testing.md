# AMASS Admin Portal — Auth Testing Playbook

## Accounts (see /app/memory/test_credentials.md)
- Super Admin: admin@amass.africa / ya0y9os77F@c8TXXh5@A
- content@amass.africa / Amass@2026 (content_manager)
- finance@amass.africa / Amass@2026 (finance)
- support@amass.africa / Amass@2026 (customer_support)

## API checks
curl -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@amass.africa","password":"ya0y9os77F@c8TXXh5@A"}'
# returns {token, user}. Use token as Bearer:
curl $BASE/api/auth/me -H "Authorization: Bearer <token>"
curl $BASE/api/dashboard/stats -H "Authorization: Bearer <token>"

## RBAC
- content_manager should get 403 on /api/roles and /api/leads
- finance should get 403 on /api/cms/sections
- super_admin has access to everything
