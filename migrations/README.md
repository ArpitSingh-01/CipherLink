# CipherLink — Database Migrations

This directory contains the SQL migration files for the CipherLink Postgres database, managed using Drizzle ORM.

## How to Run Migrations

### Prerequisites
Ensure your `.env` file contains a valid `DATABASE_URL` pointing to your target Postgres database instance.

### Commands

To apply migrations in development or production, run:
```bash
npm run db:push
```
*Note: Depending on your deployment environment, Drizzle kit or a custom migration script applies these schema updates.*

## Migration History Summary

The schema has evolved to support E2E encryption guarantees, multi-device sync, and strict security compliance:

| Migration | File Name | Key Focus / Features Added |
|---|---|---|
| **0000** | `0000_concerned_master_chief.sql` | Initial schema setup (users, devices, messages, friend requests). |
| **0001** | `0001_add_missing_fields.sql` | Schema consistency fixes and missing schema fields. |
| **0002** | `0002_diamond_hardening.sql` | Security hardening for crypto parameters and metadata. |
| **0003** | `0003_race_condition_fix.sql` | Transaction locking and timestamp resolution for messages. |
| **0004** | `0004_security_audit_hardening.sql` | IP logging, rate limits, and audit logs. |
| **0005** | `0005_structural_integrity_hardening.sql` | Cascading deletes and foreign key constraints. |
| **0006** | `0006_performance_and_integrity_hardening.sql` | Compound indexes and foreign key optimizations. |
| **0007** | `0007_optimized_messages_index.sql` | Custom message indexes for query speedup. |
| **0008** | `0008_add_conversation_id.sql` | Session grouping support. |
| **0009** | `0009_multi_device_and_rotation_support.sql` | Device keys and key rotation history tracking. |
| **0010** | `0010_device_and_history_indexes.sql` | Optimized querying of device registration states. |
| **0011** | `0011_add_missing_security_tables.sql` | Key verification and security event logs. |
| **0012** | `0012_unique_constraints.sql` | Prevention of duplicate registrations and requests. |
| **0013** | `0013_privacy_and_retention_hardening.sql` | Strict TTL support and auto-pruning metadata. |
| **0014** | `0014_add_user_display_name.sql` | Support for custom user display names. |
| **0015** | `0015_rls_backend_access_all_tables.sql` | Row Level Security (RLS) policies for Supabase Realtime isolation. |
| **0016** | `0016_cleanup_duplicate_indexes.sql` | Cleaning up redundant indexes from previous hardening passes. |
