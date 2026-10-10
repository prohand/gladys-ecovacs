import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const BASE = `# Changelog

## [Unreleased]

### Added

- Something.

[Unreleased]: https://github.com/prohand/gladys-ecovacs/commits/main
`;

test('the Unreleased section moves under the released version', () => {
  const rolled = rollChangelog(BASE, '1.0.1', '2026-10-10');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-10\n\n### Added\n\n- Something\./,
  );
  assert.match(
    rolled,
    /\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-ecovacs\/compare\/v1\.0\.1\.\.\.HEAD/,
  );
  assert.match(
    rolled,
    /\[1\.0\.1\]: https:\/\/github\.com\/prohand\/gladys-ecovacs\/releases\/tag\/v1\.0\.1/,
  );
});

test('rolling the same version twice changes nothing', () => {
  const once = rollChangelog(BASE, '1.0.1', '2026-10-10');
  assert.equal(rollChangelog(once, '1.0.1', '2026-10-11'), once);
});
