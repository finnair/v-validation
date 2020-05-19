#!/bin/bash
set -e

if [[ -z "${GH_TOKEN}" ]]; then
  echo 'Error GH_TOKEN env variable missing'
  exit 1;
fi

set -v

yarn clean
yarn boot
yarn build
yarn test --coverage
npm config set access public
npm login
lerna version ${1:-minor} --conventional-commits --create-release github
lerna publish from-package
