#!/bin/bash
set -e
export TZ=UTC

# Colors for pretty terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Starting CI Verification Checks ===${NC}\n"

# Step 1: Generate GraphQL code
echo -e "${BLUE}[1/5] Generating GraphQL code...${NC}"
deno task codegen
echo -e "${GREEN}✓ GraphQL generation complete.${NC}\n"

# Step 2: Check formatting
echo -e "${BLUE}[2/5] Checking code formatting...${NC}"
if ! deno fmt --check; then
  echo -e "${RED}✗ Formatting check failed. Run 'deno fmt' to fix formatting.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Formatting check passed.${NC}\n"

# Step 3: Lint and Type Check
echo -e "${BLUE}[3/5] Linting and type checking...${NC}"
if ! deno lint; then
  echo -e "${RED}✗ Linter checks failed.${NC}"
  exit 1
fi
if ! deno task check; then
  echo -e "${RED}✗ Type check failed.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Lint and type checks passed.${NC}\n"

# Step 4: Run Unit Tests
echo -e "${BLUE}[4/5] Running unit tests...${NC}"
if ! deno task test --ignore=test/keyring.integration.test.ts; then
  echo -e "${RED}✗ Unit tests failed.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ All unit tests passed.${NC}\n"

# Step 5: Check Skill Docs are Up-to-Date
echo -e "${BLUE}[5/5] Checking generated skill documentation...${NC}"
deno task generate-skill-docs
if ! git diff --exit-code skills/; then
  echo -e "${RED}✗ Generated skill documentation in 'skills/' is out of date.${NC}"
  echo -e "${RED}Please run 'deno task generate-skill-docs' and commit the changes.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Skill documentation is up-to-date.${NC}\n"

echo -e "${GREEN}=== ✓ All CI verification checks passed successfully! ===${NC}"
