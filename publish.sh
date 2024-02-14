#!/bin/bash
set -e

if [[ -z "${GH_TOKEN}" ]]; then
  echo 'Error GH_TOKEN env variable missing'
  exit 1;
fi

echo 'npm login?'
npm whoami

set -v

yarn clean
yarn install
yarn build
yarn test --coverage
npm config set access public
npx lerna version ${1:-minor} --no-private --conventional-commits --force-publish --create-release github
npx lerna publish from-package --no-private
echo 'Check/update CHANGELOG.md files and draft a Github Release manually'
