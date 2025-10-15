# Security Documentation

This document outlines the security measures implemented in the Trading AI Application.

## 📋 Table of Contents

- [Authentication & Authorization](#authentication--authorization)
- [Credential Storage](#credential-storage)
- [Input Validation](#input-validation)
- [Rate Limiting](#rate-limiting)
- [Audit Logging](#audit-logging)
- [Row Level Security (RLS)](#row-level-security-rls)
- [Security Testing](#security-testing)
- [Incident Response](#incident-response)
- [Compliance](#compliance)

---

## 🔐 Authentication & Authorization

### JWT Validation
- All edge functions use `supabase.auth.getUser()` for JWT validation
- **NEVER** decode JWT tokens manually using `jose` or similar libraries
- Token validation is handled by Supabase's built-in authentication

### Admin Roles
- Admin roles are stored in the `user_roles` table with Row Level Security (RLS)
- Use the `has_role(user_id, role)` function for server-side role checks
- **CRITICAL**: Never trust client-side role checks - always validate on the server

### Best Practices
```typescript
// ✅ CORRECT: Use Supabase auth
const { data: { user }, error } = await supabase.auth.getUser(token);

// ❌ WRONG: Manual JWT decoding
// const decoded = jwt.verify(token, secret);
```

---

## 🔒 Credential Storage

### Broker API Keys
- All broker credentials are encrypted using **pgsodium AES-GCM** encryption
- Encryption keys are stored securely in Supabase Vault
- Credentials are stored as `bytea` columns: `encrypted_api_key` and `encrypted_api_secret`

### Encryption Process
1. API keys are encrypted before storage using `pgsodium.crypto_aead_det_encrypt()`
2. Each connection has a unique `key_id` referencing the encryption key
3. Decryption only occurs in edge functions with service role privileges

### Migration from Legacy
- Legacy credentials stored in `encrypted_credentials` JSONB column
- Use `migrate_legacy_credentials()` function to migrate to new encrypted columns
- Legacy column should be dropped after verification (1 week buffer recommended)

```sql
-- Run migration
SELECT * FROM migrate_legacy_credentials();

-- Verify migration
SELECT COUNT(*) FROM broker_connections 
WHERE encrypted_api_key IS NULL AND encrypted_credentials IS NOT NULL;
```

---

## ✅ Input Validation

### Zod Schemas
All edge function inputs are validated using Zod schemas defined in `supabase/functions/_shared/validation-schemas.ts`:

- **BrokerCredentialsSchema**: Validates broker connection credentials
- **SignalExecutionSchema**: Validates trading signal execution requests
- **TrainingRequestSchema**: Validates model training requests
- **StockPriceRequestSchema**: Validates stock price fetch requests
- **StockHistoryRequestSchema**: Validates historical data requests

### Validation Rules
- **Symbols**: `^[A-Z0-9]{2,12}$` (uppercase alphanumeric, 2-12 chars)
- **Quantity**: Max 1,000,000
- **Special Characters**: Rejected to prevent SQL injection
- **Email**: Validated with `.email()` and max 255 characters
- **Passwords**: Min 12 chars, uppercase, lowercase, numbers, special chars

### Usage Example
```typescript
import { validateInput, StockPriceRequestSchema } from '../_shared/validation-schemas.ts';

const validatedData = validateInput(StockPriceRequestSchema, requestBody);
```

---

## 🚦 Rate Limiting

### Implementation
Rate limiting is implemented using a sliding window algorithm in `supabase/functions/_shared/rate-limiter.ts`.

### Limits by Endpoint
| Endpoint | Limit | Window |
|----------|-------|--------|
| `/fetch-crypto-prices` | 100 req/min | Per IP |
| `/fetch-stock-price` | 100 req/min | Per IP |
| `/fetch-stock-history` | 50 req/min | Per IP |

### Rate Limit Logs
- Logs stored in `rate_limit_log` table
- Retention: 1 hour (cleaned up automatically)
- Returns **429 Too Many Requests** with `Retry-After` header

### Usage Example
```typescript
import { checkRateLimit, getClientIp } from '../_shared/rate-limiter.ts';

const ipAddress = getClientIp(req);
const rateLimitResult = await checkRateLimit(
  supabase,
  { endpoint: 'fetch-crypto-prices', limit: 100, windowMinutes: 1 },
  userId,
  ipAddress
);

if (!rateLimitResult.allowed) {
  return createRateLimitResponse(rateLimitResult, corsHeaders);
}
```

---

## 📊 Audit Logging

### Service Role Audit
All service role operations are logged to the `service_role_audit` table.

### Logged Information
- **function_name**: Edge function name
- **action**: Operation performed (e.g., 'decrypt_credentials', 'validate_input')
- **user_id**: User initiating the action (if applicable)
- **metadata**: Additional context (errors, validation results, etc.)
- **created_at**: Timestamp of the operation

### Retention Policy
- Audit logs are retained for **90 days**
- Automatic cleanup via `cleanup_old_audit_logs()` function
- Scheduled as a daily cron job at 2 AM

### Admin Dashboard
- Access at `/security-audit` (admin-only)
- Real-time log viewing with filters
- Metrics: total calls, unique users, failed operations
- Export to CSV for compliance

---

## 🛡️ Row Level Security (RLS)

### Enabled on All Tables
RLS is enabled on all user-facing tables to ensure data isolation.

### Key Policies
- **Profiles**: Users can only view/update their own profile (`auth.uid() = id`)
- **Broker Connections**: Users can only manage their own connections (`auth.uid() = user_id`)
- **User Asset Prefs**: Users can only modify their own preferences (`auth.uid() = user_id`)
- **Service Role Audit**: Only admins can view (`has_role(auth.uid(), 'admin')`)

### Admin-Only Tables
- `user_roles`: Service role can insert, users can view their own roles
- `feature_flags`: Admins can manage, anyone can view
- `models`: Admins can manage, anyone can view active models

---

## 🧪 Security Testing

### Test Suite
Security tests are located in `src/tests/security.test.ts` (to be implemented).

### Test Categories
1. **JWT Validation**: Ensure forged tokens are rejected
2. **Encryption**: Verify credentials are encrypted before storage
3. **RLS**: Confirm users can't access other users' data
4. **Input Validation**: Test rejection of invalid symbols and special characters
5. **Rate Limiting**: Verify excessive requests are blocked
6. **Audit Logging**: Ensure all service role operations are logged
7. **Password Validation**: Test weak password rejection

### Running Tests
```bash
npm run test:security
```

---

## 🚨 Incident Response

### In Case of Security Breach

1. **Immediate Actions**
   - Check audit logs at `/security-audit` for suspicious activity
   - Identify affected user accounts and broker connections
   - Disable compromised broker connections via Settings page

2. **Investigation**
   - Review rate limit logs for attack patterns
   - Check `service_role_audit` for unauthorized decryptions
   - Analyze failed authentication attempts in auth logs

3. **Remediation**
   - Rotate encryption keys if credential theft is suspected
   - Force password resets for affected users
   - Update RLS policies if access control bypass detected

4. **Communication**
   - Notify affected users via email
   - Document incident in internal security log
   - Update security measures to prevent recurrence

### Monitoring Checklist
- [ ] Daily review of audit logs for anomalies
- [ ] Weekly security scan using Supabase linter
- [ ] Monthly review of RLS policies
- [ ] Quarterly penetration testing

---

## 📜 Compliance

### GDPR (General Data Protection Regulation)
- **Right to Erasure**: Users can delete their account via Settings → Danger Zone
- **Data Portability**: Export functionality available for audit logs (admin)
- **Consent**: User consent required for authentication (email/password signup)

### SOC 2 (Service Organization Control 2)
- **Audit Logs**: Retained for 90 days for compliance audits
- **Access Control**: Admin roles enforced via RLS and `user_roles` table
- **Encryption**: All broker credentials encrypted at rest

### PCI DSS (Payment Card Industry Data Security Standard)
- **No Card Data**: Application does not store credit card information
- **API Keys Only**: Broker connections use API keys, not payment credentials
- **Secure Storage**: API keys encrypted with industry-standard AES-GCM

---

## 📞 Contact

For security concerns or to report vulnerabilities:
- **Email**: security@yourdomain.com (replace with actual email)
- **GitHub Issues**: For non-critical security improvements
- **Admin Dashboard**: `/security-audit` for operational security monitoring

---

## 🔄 Updates

This document is reviewed and updated quarterly. Last updated: **2025-10-15**

### Recent Changes
- **2025-10-15**: Added Phases 1-6 security implementations
  - JWT validation with `supabase.auth.getUser()`
  - Credential encryption with pgsodium
  - Input validation with Zod schemas
  - Rate limiting with sliding window algorithm
  - Enhanced authentication with password strength requirements
  - Admin dashboard for audit log monitoring
