#!/bin/sh

# Pre-push hook to run integration tests on feature branches
# This hook runs `pnpm test:integration` before pushing to prevent broken code
# from being pushed to your feature branches.

echo "🔍 Pre-push hook: Checking if integration tests should run..."

# Get the current branch name
current_branch=$(git rev-parse --abbrev-ref HEAD)

echo "🧪 Running integration tests for branch: $current_branch"
echo "📝 Command: pnpm test:integration"
echo ""

# Change to the project root directory
cd "$(git rev-parse --show-toplevel)"

# Run the integration tests
if pnpm test:integration; then
    echo ""
    echo "✅ Integration tests passed! Proceeding with push..."
    exit 0
else
    echo ""
    echo "❌ Integration tests failed!"
    echo "🚫 Push blocked to prevent broken code from being pushed."
    echo ""
    echo "To fix this:"
    echo "  1. Fix the failing tests"
    echo "  2. Commit your changes"
    echo "  3. Try pushing again"
    echo ""
    echo "To skip this check (not recommended):"
    echo "  git push --no-verify"
    echo ""
    exit 1
fi
