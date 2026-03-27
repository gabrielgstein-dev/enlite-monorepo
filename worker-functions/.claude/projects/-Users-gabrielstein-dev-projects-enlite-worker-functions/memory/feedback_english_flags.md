---
name: Always use English for enum/flag values
description: All enum values and flag constants must be in English, never Portuguese or Spanish
type: feedback
---

Always use English for all enum values, flag constants, and status strings across the entire codebase.

**Why:** The codebase standard (established in migration 032 and import-utils classifyProfession) uses English. Using Portuguese/Spanish values (e.g. AMBOS, CUIDADOR, ESTUDANTE) causes silent mismatches between import pipeline, DB constraints, and matching logic.

**How to apply:** Whenever suggesting or writing enum values for workers, job postings, or any other domain entity, always use English: BOTH (not AMBOS), CARER (not CUIDADOR), STUDENT (not ESTUDANTE/ESTUDIANTE), M/F/BOTH for sex (not MASCULINO/FEMININO/AMBOS). This applies in ALL conversations, not just this codebase.
