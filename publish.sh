#!/bin/bash
set -e

if [[ -z "${GH_TOKEN}" ]]; then
  echo 'Error GH_TOKEN env variable missing'
  exit 1;
fi

lerna version ${1:-minor} --conventional-commits --create-release github
lerna publish from-package
