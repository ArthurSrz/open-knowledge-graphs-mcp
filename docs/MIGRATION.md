# Migration Guide: Streamlit to Static Site

This guide documents the migration from the original Streamlit app to the current static-site + scheduled-data pipeline.

## Scope

- Migrated from runtime SPARQL queries in a Streamlit app to precomputed JSON/Turtle artifacts.
- Frontend moved to static HTML/CSS/JS under `site/`.
- Data refresh moved to scheduled GitHub Actions.
- `app.py` was removed from `main`.

## Why the Migration Happened

- Improve reliability and response times for end users.
- Avoid per-visitor load on Wikidata Query Service.
- Support deterministic daily snapshots with known refresh timestamps.
- Simplify hosting to static GitHub Pages deployment.

## Feature Mapping

| Legacy Streamlit | Current Implementation |
| --- | --- |
| Runtime SPARQL calls in `app.py` | Scheduled extraction via `scripts/fetch_data.py` |
| In-memory dataframe transforms | JSON/Turtle artifact generation in `data/` |
| Streamlit table interactions | Client-side table/cards in `site/app.js` |
| Runtime sort/search | URL-backed sort/search/filter state in static JS |
| Single app runtime deployment | GitHub Pages static deploy workflow |

## Data Model Comparison

Legacy reference:

- `dist/catalog.ttl` (old model reference; not tracked in git)

Current model:

- Ontology/SHACL schema: `ontology.ttl`
- Published schema URL: https://openknowledgegraphs.com/ontology.ttl
- Published data URLs:
  - https://openknowledgegraphs.com/data/ontologies.ttl
  - https://openknowledgegraphs.com/data/software.ttl
  - https://openknowledgegraphs.com/data/ontologies.json
  - https://openknowledgegraphs.com/data/software.json

Notable current-model additions:

- Multi-type support for ontology resources
- Description field (`okg:description`)
- Optional domain category field (`okg:category`) backed by `data/categories.json`
- JSON payload envelope with `generatedAt`

## Operational Migration Checklist

1. Remove Streamlit runtime dependencies from `requirements.txt`.
2. Remove `app.py` from `main`.
3. Ensure data refresh workflow is active (`update-data.yml`).
4. Ensure deploy workflow is active (`deploy.yml`).
5. Ensure Pages serves:
   - site assets
   - `data/` files
   - `ontology.ttl`
6. Verify live links resolve from `openknowledgegraphs.com`.
7. Validate frontend behavior against expected defaults:
   - default tab: Ontologies
   - default search: empty
   - URL state persists tab/search/sort/category

## For Downstream Consumers

If you consumed Streamlit-specific behavior, migrate to static artifacts:

- Replace app-level scraping/integration with direct JSON/Turtle consumption.
- Use `generatedAt` for freshness checks.
- Treat optional keys as nullable-by-omission (key may not exist).

## Reclassification and Backfills

Category assignments are designed to be stable once written.

- Incremental behavior: `scripts/fetch_data.py` classifies only newly discovered ontology QIDs.
- Manual backfill/reclassification:
  - `python scripts/classify_categories.py`
  - `python scripts/classify_categories.py --force`

## Rollback Strategy

If a deployment regression occurs:

1. Revert the problematic commit in `main`.
2. Re-run Pages deployment via workflow dispatch.
3. Optionally rerun data refresh workflow to regenerate artifacts.
