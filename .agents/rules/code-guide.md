---
trigger: always_on
---

# AI Coding Assistant Rules

- Follow the existing project architecture, style, naming, and patterns.
- Make the smallest safe change needed to complete the task.
- Do not modify unrelated files.
- Do not add dependencies unless necessary and justified.
- Do not hardcode secrets, credentials, URLs, or environment-specific values.
- Reuse existing utilities, services, components, and types.
- Keep code readable, simple, typed, and maintainable.
- Add or update tests when changing logic.
- Preserve existing behavior unless a change is explicitly requested.
- Validate inputs and handle errors properly.
- Do not weaken security, authentication, authorization, or data validation.
- Avoid large rewrites unless explicitly requested.
- Ask clarification questions when requirements are unclear.
- Summarize changes, affected files, tests, assumptions, and risks.
- Always reference to Maximo REST API documentation when building any CRUD tools:
  - Full Documentation: https://ibm-maximo-dev.github.io/maximo-restapi-documentation/
  - Quick start reference: https://maximomastery.com/blog/2026/02/maximo-nextgen-rest-api-a-practical-guide-to-querying-creating-and-integrating/
